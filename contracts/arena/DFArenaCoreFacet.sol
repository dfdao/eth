// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibPlanet} from "../libraries/LibPlanet.sol";

// Contract imports
import {Diamond} from "../vendor/Diamond.sol";
import {DFWhitelistFacet} from "../facets/DFWhitelistFacet.sol";
import {DFCoreFacet} from "../facets/DFCoreFacet.sol";

// Interface imports
import {IDiamondCut} from "../vendor/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../vendor/interfaces/IDiamondLoupe.sol";
import {IERC173} from "../vendor/interfaces/IERC173.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";
import {WithArenaStorage, ArenaStorage, ArenaPlanetInfo, ArenaConstants} from "../libraries/LibArenaStorage.sol";

import {SpaceType, DFPInitPlanetArgs, Artifact, ArtifactType, Player, Planet, PlanetType, PlanetExtendedInfo, PlanetExtendedInfo2, RevealProofArgs} from "../DFTypes.sol";

import {
    Planet, 
    PlanetExtendedInfo, 
    PlanetExtendedInfo2, 
    PlanetEventMetadata, 
    PlanetDefaultStats, 
    Player, 
    Artifact,
    ArtifactType,
    ArenaPlanetInfo,
    ArenaAdminCreatePlanetArgs,
    ArenaPlayerInfo
} from "../DFTypes.sol";

contract DFArenaCoreFacet is WithStorage, WithArenaStorage {
    event AdminPlanetCreated(uint256 loc);
    event TargetPlanetInvaded(address player, uint256 loc);
    event Gameover(uint256 loc, address winner);
    event PlayerInitialized(address player, uint256 loc);
    event LocationRevealed(address revealer, uint256 loc, uint256 x, uint256 y);

    modifier onlyAdmin() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

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

    modifier targetPlanetsActive() {
        require(arenaConstants().TARGET_PLANETS, "target planets are disabled");
        _;
    }

    // FUNCTIONS TO REPLACE on core DF Diamond
    function arenaInitializePlayer(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[8] memory _input,
        uint256 team
    ) public onlyWhitelisted returns (uint256) {
        uint256 _location = _input[0];
        uint256 _perlin = _input[1];
        uint256 _radius = _input[2];

        if (arenaConstants().MANUAL_SPAWN) {            
            require(arenaStorage().arenaPlanetInfo[_location].spawnPlanet, "Planet is not a spawn planet");

            Planet storage _planet = gs().planets[_location];
            PlanetExtendedInfo storage _planetExtendedInfo = gs().planetsExtendedInfo[_location];

            require(_planetExtendedInfo.isInitialized, "Planet not initialized");
            require(_planet.owner == address(0), "Planet is owned");
            require(!_planet.isHomePlanet, "Planet is already a home planet");

            _planet.isHomePlanet = true;
            _planet.owner = msg.sender;
            _planet.population = _planet.populationCap * 25 / 100;
            _planetExtendedInfo.lastUpdated = block.timestamp;


        } else {
            LibPlanet.initializePlanet(_a, _b, _c, _input, true);
        }


        // Checks player hasn't already initialized and confirms PERLIN.
        require(LibPlanet.checkPlayerInit(_location, _perlin, _radius));

        // Initialize player data
        gs().playerIds.push(msg.sender);
        gs().players[msg.sender] = Player(
            true,
            msg.sender,
            block.timestamp,
            _location,
            0,
            0,
            0,
            gameConstants().SPACE_JUNK_LIMIT,
            false
        );

        if(arenaConstants().TEAMS_ENABLED) {
            require(team <= arenaConstants().NUM_TEAMS, 'invalid team');
            require(team > 0, 'team cannot be 0');

            arenaStorage().arenaPlayerInfo[msg.sender].team = team;
            arenaStorage().teams[team].push(msg.sender);
        }

        LibGameUtils.updateWorldRadius();
        emit PlayerInitialized(msg.sender, _location);
        return _location;
    }

    function claimTargetPlanetVictory(uint256 locationId)
        public
        onlyWhitelisted
        notPaused
        targetPlanetsActive
    {
        require(!arenaStorage().gameover, "cannot claim victory when game is over");

        LibPlanet.refreshPlanet(locationId);
        Planet memory planet = gs().planets[locationId];
        PlanetExtendedInfo memory planetExtendedInfo = gs().planetsExtendedInfo[locationId];

        require(planet.owner == msg.sender, "you can only claim victory with planets you own");
        require(!planetExtendedInfo.destroyed, "planet is destroyed");

        require(
            arenaStorage().arenaPlanetInfo[locationId].targetPlanet,
            "you can only claim victory on a target planet"
        );

        require(
            (planet.population * 100) / planet.populationCap >=
                arenaConstants().CLAIM_VICTORY_ENERGY_PERCENT,
            "planet energy must be greater than victory threshold"
        );

        ArenaPlayerInfo memory player = arenaStorage().arenaPlayerInfo[msg.sender];
        arenaStorage().gameover = true;
        if(arenaConstants().TEAMS_ENABLED){
            uint256 winningTeam = player.team;
            arenaStorage().winners = arenaStorage().teams[winningTeam];
        } else {
            arenaStorage().winners.push(msg.sender);
        }

        arenaStorage().endTime = block.timestamp;
        gs().paused = true;
        emit Gameover(locationId, msg.sender);
    }

    function createArenaPlanet(ArenaAdminCreatePlanetArgs memory args) public onlyAdmin {
        require(gameConstants().ADMIN_CAN_ADD_PLANETS, "admin can no longer add planets");
        if (args.requireValidLocationId) {
            require(LibGameUtils._locationIdValid(args.location), "Not a valid planet location");
        }

        if (args.isTargetPlanet)
            require(arenaConstants().TARGET_PLANETS, "admin cannot create target planets");
        if (args.isSpawnPlanet)
            require(arenaConstants().MANUAL_SPAWN, "admin cannot create spawn planets");

        if (args.isTargetPlanet || args.isSpawnPlanet) {
            arenaStorage().arenaPlanetInfo[args.location] = ArenaPlanetInfo(
                args.isSpawnPlanet,
                args.isTargetPlanet
            );
            if (args.isTargetPlanet) arenaStorage().targetPlanetIds.push(args.location);
            if (args.isSpawnPlanet) arenaStorage().spawnPlanetIds.push(args.location);
        }

        SpaceType spaceType = LibGameUtils.spaceTypeFromPerlin(args.perlin);
        LibPlanet._initializePlanet(
            DFPInitPlanetArgs(
                args.location,
                args.perlin,
                args.level,
                gameConstants().TIME_FACTOR_HUNDREDTHS,
                spaceType,
                args.planetType,
                false
            )
        );

        gs().planetIds.push(args.location);
        gs().initializedPlanetCountByLevel[args.level] += 1;

        emit AdminPlanetCreated(args.location);
    }

    function arenaRevealLocation(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[9] memory _input
    ) public onlyWhitelisted returns (uint256) {
        require(DFCoreFacet(address(this)).checkRevealProof(_a, _b, _c, _input), "Failed reveal pf check");

        if (!gs().planetsExtendedInfo[_input[0]].isInitialized) {
            LibPlanet.initializePlanetWithDefaults(_input[0], _input[1], false);
        }

        LibPlanet.revealLocation(
            _input[0],
            _input[1],
            _input[2],
            _input[3],
            msg.sender != LibDiamond.contractOwner()
        );
        emit LocationRevealed(msg.sender, _input[0], _input[2], _input[3]);
    }

    function bulkCreatePlanet(ArenaAdminCreatePlanetArgs[] memory planets) public onlyAdmin {
        for(uint i = 0; i < planets.length; i++) {
            createArenaPlanet(planets[i]);
        }
    }

    function createAndReveal(
        ArenaAdminCreatePlanetArgs memory createPlanetArgs, 
        RevealProofArgs memory revealArgs
    ) public onlyAdmin {
        createArenaPlanet(createPlanetArgs);
        arenaRevealLocation(revealArgs._a, revealArgs._b, revealArgs._c, revealArgs._input);
    }

    function bulkCreateAndReveal(
        ArenaAdminCreatePlanetArgs [] calldata createArgsList,
        RevealProofArgs [] calldata revealArgsList
    ) public {
        for (uint256 i = 0; i < createArgsList.length; i++) {
            createAndReveal(createArgsList[i], revealArgsList[i]);
        }
    }

}