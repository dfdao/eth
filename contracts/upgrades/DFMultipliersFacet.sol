// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Facet imports
import {DFWhitelistFacet} from "../facets/DFWhitelistFacet.sol";
import {DFCoreFacet} from "../facets/DFCoreFacet.sol";

// Type imports
import {ArenaAdminCreatePlanetArgs} from "../facets/DFArenaCoreFacet.sol";
import {SpaceType, PlanetType, DFPInitPlanetArgs, Planet, PlanetExtendedInfo, Player, PlanetExtendedInfo2, PlanetDefaultStats} from "../DFTypes.sol";

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibPlanet} from  "../libraries/LibPlanet.sol";
import {Verifier} from "../Verifier.sol";
import {LibPlanetInit} from "./LibPlanetInit.sol";

// Storage imports
import {LibStorage, WithStorage, GameStorage, GameConstants, SnarkConstants} from "../libraries/LibStorage.sol";
import {WithArenaStorage, LibArenaStorage, ArenaStorage, ArenaPlanetInfo, ArenaConstants} from "../upgrades/LibArenaUpgradeStorage.sol";

contract DFMultipliersFacet is WithStorage, WithArenaStorage {
    event AdminPlanetCreated(uint256 loc);
    event PlayerInitialized(address player, uint256 loc);
    event LocationRevealed(address revealer, uint256 loc, uint256 x, uint256 y);

    modifier onlyAdmin() {
        LibDiamond.enforceIsContractOwner();
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

    function createPlanet(ArenaAdminCreatePlanetArgs memory args) public onlyAdmin {
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
        LibPlanetInit._initializePlanet(
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

    function initializePlayer(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[8] memory _input
    ) public onlyWhitelisted returns (uint256) {
        uint256 _location = _input[0];
        uint256 _perlin = _input[1];
        uint256 _radius = _input[2];

        if (arenaConstants().MANUAL_SPAWN) {
            require(
                arenaStorage().arenaPlanetInfo[_location].spawnPlanet,
                "Planet is not a spawn planet"
            );

            Planet storage _planet = gs().planets[_location];
            PlanetExtendedInfo storage _planetExtendedInfo = gs().planetsExtendedInfo[_location];

            require(_planetExtendedInfo.isInitialized, "Planet not initialized");
            require(_planet.owner == address(0), "Planet is owned");
            require(!_planet.isHomePlanet, "Planet is already a home planet");

            _planet.isHomePlanet = true;
            _planet.owner = msg.sender;
            _planet.population = (_planet.populationCap * 25) / 100;
            _planetExtendedInfo.lastUpdated = block.timestamp;
        } else {
            LibPlanetInit.initializePlanet(_a, _b, _c, _input, true);
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

        LibGameUtils.updateWorldRadius();
        emit PlayerInitialized(msg.sender, _location);
        return _location;
    }

    function adminInitializePlanet(uint256 locationId, uint256 perlin) public onlyAdmin {
        require(
            !gs().planetsExtendedInfo2[locationId].isInitialized,
            "planet is already initialized"
        );

        LibPlanetInit.initializePlanetWithDefaults(locationId, perlin, false);
    }

    function revealLocation(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[9] memory _input
    ) public onlyWhitelisted returns (uint256) {
        require(
            DFCoreFacet(address(this)).checkRevealProof(_a, _b, _c, _input),
            "Failed reveal pf check"
        );

        if (!gs().planetsExtendedInfo[_input[0]].isInitialized) {
            LibPlanetInit.initializePlanetWithDefaults(_input[0], _input[1], false);
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
        LibPlanetInit._initializePlanet(
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
}
