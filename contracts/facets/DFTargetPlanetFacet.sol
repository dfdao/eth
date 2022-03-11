// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// External contract imports
import {DFCoreFacet} from "./DFCoreFacet.sol";
import {DFWhitelistFacet} from "./DFWhitelistFacet.sol";

// Library imports
import {LibPlanet} from "../libraries/LibPlanet.sol";
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";

// Type imports
import {Planet, PlanetExtendedInfo, PlanetExtendedInfo2} from "../DFTypes.sol";

contract DFTargetPlanetFacet is WithStorage {
    modifier notPaused() {
        require(!gs().paused, "Game is paused");
        _;
    }

    modifier onlyWhitelisted() {
        require(
            DFWhitelistFacet(address(this)).isWhitelisted(msg.sender) ||
                msg.sender == LibDiamond.contractOwner(),
            "Player is not whitelisted"
        );
        _;
    }

    modifier targetPlanets() {
        require(gameConstants().TARGET_PLANETS, "target planets are disabled");
        _;
    }

    event TargetPlanetInvaded(address player, uint256 loc);
    event Gameover(address winner);

    function invadeTargetPlanet(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[9] memory _input
    ) public onlyWhitelisted notPaused targetPlanets {
        DFCoreFacet(address(this)).checkRevealProof(_a, _b, _c, _input);

        uint256 locationId = _input[0];

        LibPlanet.refreshPlanet(locationId);
        Planet memory planet = gs().planets[locationId];
        PlanetExtendedInfo memory planetExtendedInfo = gs().planetsExtendedInfo[locationId];
        PlanetExtendedInfo2 storage planetExtendedInfo2 = gs().planetsExtendedInfo2[locationId];

        require(!planetExtendedInfo.destroyed, "planet is destroyed");
        require(planetExtendedInfo2.invader == address(0), "planet is already invaded");
        require(planetExtendedInfo2.capturer == address(0), "planet has already been captured");
        require(planet.owner == msg.sender, "you can only invade planets you own");

        planetExtendedInfo2.invader = msg.sender;
        planetExtendedInfo2.invadeStartBlock = block.number;

        emit TargetPlanetInvaded(msg.sender, locationId);
    }

    function claimTargetPlanetVictory(uint256 locationId)
        public
        onlyWhitelisted
        notPaused
        targetPlanets
    {
        require(!gs().gameover, "cannot claim victory when game is over");

        LibPlanet.refreshPlanet(locationId);
        Planet memory planet = gs().planets[locationId];
        PlanetExtendedInfo memory planetExtendedInfo = gs().planetsExtendedInfo[locationId];
        PlanetExtendedInfo2 memory planetExtendedInfo2 = gs().planetsExtendedInfo2[locationId];

        require(!gs().gameover, "cannot claim victory when game is over");
        require(gs().targetPlanets[locationId], "you can only claim victory with a target planet");
        require(planet.owner == msg.sender, "you can only claim victory with planets you own");
        require(!planetExtendedInfo.destroyed, "planet is destroyed");
        require(
            planetExtendedInfo2.invader != address(0),
            "you must invade the planet before capturing"
        );

        require(
            planetExtendedInfo2.invadeStartBlock +
                gameConstants().TARGET_PLANET_HOLD_BLOCKS_REQUIRED <=
                block.number,
            "you have not held the planet long enough to claim victory with it"
        );

        gs().gameover = true;
        gs().winner = msg.sender;
        emit Gameover(msg.sender);
    }
}
