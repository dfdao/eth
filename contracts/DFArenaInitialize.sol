// SPDX-License-Identifier: GPL-3.0 AND MIT
/**
 * Customized version of DiamondInit.sol
 *
 * Vendored on November 16, 2021 from:
 * https://github.com/mudgen/diamond-3-hardhat/blob/7feb995/contracts/upgradeInitializers/DiamondInit.sol
 */
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
*
* Implementation of a diamond.
/******************************************************************************/

// It is expected that this contract is customized in order to deploy a diamond with data
// from a deployment script. The init function is used to initialize state variables
// of the diamond. Add parameters to the init function if you need to.

// Interface imports
import {IDiamondLoupe} from "./vendor/interfaces/IDiamondLoupe.sol";
import {IDiamondCut} from "./vendor/interfaces/IDiamondCut.sol";
import {IERC173} from "./vendor/interfaces/IERC173.sol";
import {IERC165} from "@solidstate/contracts/introspection/IERC165.sol";
import {IERC721} from "@solidstate/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@solidstate/contracts/token/ERC721/metadata/IERC721Metadata.sol";
import {IERC721Enumerable} from "@solidstate/contracts/token/ERC721/enumerable/IERC721Enumerable.sol";

// Inherited storage
import {ERC721MetadataStorage} from "@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol";

// Library imports
import {LibDiamond} from "./vendor/libraries/LibDiamond.sol";
import {WithStorage} from "./libraries/LibStorage.sol";
import {WithArenaStorage} from "./libraries/LibArenaStorage.sol";
import {LibGameUtils} from "./libraries/LibGameUtils.sol";


// Type imports
import {PlanetDefaultStats, Upgrade, UpgradeBranch, Modifiers, Mod, Spaceships} from "./DFTypes.sol";

struct InitArgs {
    bool START_PAUSED;
    bool ADMIN_CAN_ADD_PLANETS;
    uint256 LOCATION_REVEAL_COOLDOWN;
    uint256 TOKEN_MINT_END_TIMESTAMP;
    bool WORLD_RADIUS_LOCKED;
    uint256 WORLD_RADIUS_MIN;
    // SNARK keys and perlin params
    bool DISABLE_ZK_CHECKS;
    uint256 PLANETHASH_KEY;
    uint256 SPACETYPE_KEY;
    uint256 BIOMEBASE_KEY;
    bool PERLIN_MIRROR_X;
    bool PERLIN_MIRROR_Y;
    uint256 PERLIN_LENGTH_SCALE; // must be a power of two up to 8192
    // Game config
    uint256 MAX_NATURAL_PLANET_LEVEL;
    uint256 TIME_FACTOR_HUNDREDTHS; // speedup/slowdown game
    uint256 PERLIN_THRESHOLD_1;
    uint256 PERLIN_THRESHOLD_2;
    uint256 PERLIN_THRESHOLD_3;
    uint256 INIT_PERLIN_MIN;
    uint256 INIT_PERLIN_MAX;
    uint256 SPAWN_RIM_AREA;
    uint256 BIOME_THRESHOLD_1;
    uint256 BIOME_THRESHOLD_2;
    uint256[10] PLANET_LEVEL_THRESHOLDS;
    uint256 PLANET_RARITY;
    bool PLANET_TRANSFER_ENABLED;
    uint8[5][10][4] PLANET_TYPE_WEIGHTS; // spaceType (enum 0-3) -> planetLevel (0-7) -> planetType (enum 0-4)
    uint256 SILVER_SCORE_VALUE;
    uint256[6] ARTIFACT_POINT_VALUES;
    uint256 PHOTOID_ACTIVATION_DELAY;
    // Space Junk
    bool SPACE_JUNK_ENABLED;
    /**
        Total amount of space junk a player can take on.
        This can be overridden at runtime by updating
        this value for a specific player in storage.
    */
    uint256 SPACE_JUNK_LIMIT;
    /**
        The amount of junk that each level of planet
        gives the player when moving to it for the
        first time.
    */
    uint256[10] PLANET_LEVEL_JUNK;
    /**
        The speed boost a movement receives when abandoning
        a planet.
    */
    uint256 ABANDON_SPEED_CHANGE_PERCENT;
    /**
        The range boost a movement receives when abandoning
        a planet.
    */
    uint256 ABANDON_RANGE_CHANGE_PERCENT;
    // Capture Zones
    bool CAPTURE_ZONES_ENABLED;
    uint256 CAPTURE_ZONE_COUNT;
    uint256 CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL;
    uint256 CAPTURE_ZONE_RADIUS;
    uint256[10] CAPTURE_ZONE_PLANET_LEVEL_SCORE;
    uint256 CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED;
    uint256 CAPTURE_ZONES_PER_5000_WORLD_RADIUS;
    // Target Planet
    bool TARGET_PLANETS;
    uint256 TARGET_PLANET_HOLD_BLOCKS_REQUIRED;
    // Manual Spawn
    bool MANUAL_SPAWN;

    uint256[8] MODIFIERS;
    bool[5] SPACESHIPS;
    uint8 CLAIM_VICTORY_ENERGY_PERCENTAGE;
}

contract DFArenaInitialize is WithStorage, WithArenaStorage {
    using ERC721MetadataStorage for ERC721MetadataStorage.Layout;

    // You can add parameters to this function in order to pass in
    // data to set initialize state variables
    function init(
        bool whitelistEnabled,
        string memory artifactBaseURI,
        InitArgs memory initArgs
    ) external {
        // adding ERC165 data
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721Metadata).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721Enumerable).interfaceId] = true;

        // Setup the ERC721 metadata
        // TODO(#1925): Add name and symbol for the artifact tokens
        ERC721MetadataStorage.layout().name = "";
        ERC721MetadataStorage.layout().symbol = "";
        ERC721MetadataStorage.layout().baseURI = artifactBaseURI;

        gs().diamondAddress = address(this);

        ws().enabled = whitelistEnabled;
        ws().drip = 0.05 ether;

        gs().planetLevelsCount = 10;
        gs().planetLevelThresholds = initArgs.PLANET_LEVEL_THRESHOLDS;

        snarkConstants().DISABLE_ZK_CHECKS = initArgs.DISABLE_ZK_CHECKS;
        snarkConstants().PLANETHASH_KEY = initArgs.PLANETHASH_KEY;
        snarkConstants().SPACETYPE_KEY = initArgs.SPACETYPE_KEY;
        snarkConstants().BIOMEBASE_KEY = initArgs.BIOMEBASE_KEY;
        snarkConstants().PERLIN_MIRROR_X = initArgs.PERLIN_MIRROR_X;
        snarkConstants().PERLIN_MIRROR_Y = initArgs.PERLIN_MIRROR_Y;
        snarkConstants().PERLIN_LENGTH_SCALE = initArgs.PERLIN_LENGTH_SCALE;

        gameConstants().ADMIN_CAN_ADD_PLANETS = initArgs.ADMIN_CAN_ADD_PLANETS;
        gameConstants().WORLD_RADIUS_LOCKED = initArgs.WORLD_RADIUS_LOCKED;
        gameConstants().WORLD_RADIUS_MIN = initArgs.WORLD_RADIUS_MIN;
        gameConstants().MAX_NATURAL_PLANET_LEVEL = initArgs.MAX_NATURAL_PLANET_LEVEL;
        gameConstants().TIME_FACTOR_HUNDREDTHS = initArgs.TIME_FACTOR_HUNDREDTHS;
        gameConstants().PERLIN_THRESHOLD_1 = initArgs.PERLIN_THRESHOLD_1;
        gameConstants().PERLIN_THRESHOLD_2 = initArgs.PERLIN_THRESHOLD_2;
        gameConstants().PERLIN_THRESHOLD_3 = initArgs.PERLIN_THRESHOLD_3;
        gameConstants().INIT_PERLIN_MIN = initArgs.INIT_PERLIN_MIN;
        gameConstants().INIT_PERLIN_MAX = initArgs.INIT_PERLIN_MAX;
        gameConstants().SPAWN_RIM_AREA = initArgs.SPAWN_RIM_AREA;
        gameConstants().BIOME_THRESHOLD_1 = initArgs.BIOME_THRESHOLD_1;
        gameConstants().BIOME_THRESHOLD_2 = initArgs.BIOME_THRESHOLD_2;
        gameConstants().PLANET_RARITY = initArgs.PLANET_RARITY;
        gameConstants().PLANET_TRANSFER_ENABLED = initArgs.PLANET_TRANSFER_ENABLED;
        gameConstants().PHOTOID_ACTIVATION_DELAY = initArgs.PHOTOID_ACTIVATION_DELAY;
        gameConstants().LOCATION_REVEAL_COOLDOWN = initArgs.LOCATION_REVEAL_COOLDOWN;
        gameConstants().PLANET_TYPE_WEIGHTS = initArgs.PLANET_TYPE_WEIGHTS;
        gameConstants().SILVER_SCORE_VALUE = initArgs.SILVER_SCORE_VALUE;
        gameConstants().ARTIFACT_POINT_VALUES = initArgs.ARTIFACT_POINT_VALUES;
        // Space Junk
        gameConstants().SPACE_JUNK_ENABLED = initArgs.SPACE_JUNK_ENABLED;
        gameConstants().SPACE_JUNK_LIMIT = initArgs.SPACE_JUNK_LIMIT;
        gameConstants().PLANET_LEVEL_JUNK = initArgs.PLANET_LEVEL_JUNK;
        gameConstants().ABANDON_SPEED_CHANGE_PERCENT = initArgs.ABANDON_SPEED_CHANGE_PERCENT;
        gameConstants().ABANDON_RANGE_CHANGE_PERCENT = initArgs.ABANDON_RANGE_CHANGE_PERCENT;
        // Capture Zones
        gameConstants().GAME_START_BLOCK = block.number;
        gameConstants().CAPTURE_ZONES_ENABLED = initArgs.CAPTURE_ZONES_ENABLED;
        gameConstants().CAPTURE_ZONE_COUNT = initArgs.CAPTURE_ZONE_COUNT;
        gameConstants().CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL = initArgs
            .CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL;
        gameConstants().CAPTURE_ZONE_RADIUS = initArgs.CAPTURE_ZONE_RADIUS;
        gameConstants().CAPTURE_ZONE_PLANET_LEVEL_SCORE = initArgs.CAPTURE_ZONE_PLANET_LEVEL_SCORE;
        gameConstants().CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED = initArgs
            .CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED;
        gameConstants().CAPTURE_ZONES_PER_5000_WORLD_RADIUS = initArgs
            .CAPTURE_ZONES_PER_5000_WORLD_RADIUS;

        gs().nextChangeBlock = block.number + initArgs.CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL;

        gs().worldRadius = initArgs.WORLD_RADIUS_MIN; // will be overridden by `LibGameUtils.updateWorldRadius()` if !WORLD_RADIUS_LOCKED

        gs().paused = initArgs.START_PAUSED;
        gs().TOKEN_MINT_END_TIMESTAMP = initArgs.TOKEN_MINT_END_TIMESTAMP;

        gs().initializedPlanetCountByLevel = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (uint256 i = 0; i < gs().planetLevelThresholds.length; i += 1) {
            gs().cumulativeRarities.push(
                (2**24 / gs().planetLevelThresholds[i]) * initArgs.PLANET_RARITY
            );
        }

        //arenaMode initialization
        arenaStorage().gameover = false;
        arenaStorage().START_TIME = block.timestamp;
        arenaConstants().CLAIM_VICTORY_ENERGY_PERCENTAGE = initArgs.CLAIM_VICTORY_ENERGY_PERCENTAGE;
        arenaConstants().TARGET_PLANETS = initArgs.TARGET_PLANETS;
        arenaConstants().TARGET_PLANET_HOLD_BLOCKS_REQUIRED = initArgs
            .TARGET_PLANET_HOLD_BLOCKS_REQUIRED;
        arenaConstants().MANUAL_SPAWN = initArgs.MANUAL_SPAWN;

        arenaConstants().MODIFIERS.popCap = initArgs.MODIFIERS[uint256(Mod.popCap)];
        arenaConstants().MODIFIERS.popGrowth = initArgs.MODIFIERS[uint256(Mod.popGrowth)];
        arenaConstants().MODIFIERS.silverCap = initArgs.MODIFIERS[uint256(Mod.silverCap)];
        arenaConstants().MODIFIERS.silverGrowth = initArgs.MODIFIERS[uint256(Mod.silverGrowth)];
        arenaConstants().MODIFIERS.range = initArgs.MODIFIERS[uint256(Mod.range)];
        arenaConstants().MODIFIERS.speed = initArgs.MODIFIERS[uint256(Mod.speed)];
        arenaConstants().MODIFIERS.defense = initArgs.MODIFIERS[uint256(Mod.defense)];
        arenaConstants().MODIFIERS.barbarianPercentage = initArgs.MODIFIERS[uint256(Mod.barbarianPercentage)];

        arenaConstants().SPACESHIPS = Spaceships(
            initArgs.SPACESHIPS[0],
            initArgs.SPACESHIPS[1],
            initArgs.SPACESHIPS[2],
            initArgs.SPACESHIPS[3],
            initArgs.SPACESHIPS[4]
        );
        
        initializeDefaults();
        initializeUpgrades();
        LibGameUtils.updateWorldRadius();
    }

    function initializeDefaults() public {
        PlanetDefaultStats[] storage planetDefaultStats = planetDefaultStats();
        require ((75* arenaConstants().MODIFIERS.speed / 100) > 0, "cannot initialize planets with 0 speed");

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Asteroid",
                populationCap: (100000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (417 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (99 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (400 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (0 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (0 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: 0
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Brown Dwarf",
                populationCap: (400000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (833 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (177 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (400 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (56 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (100000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (1 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Red Dwarf",
                populationCap: (1600000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (1250 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (315 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (300 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (167 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (500000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (2 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "White Dwarf",
                populationCap: (6000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (1667 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (591 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (300 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (417 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (2500000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (3 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Yellow Star",
                populationCap: (25000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (2083 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (1025 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (300 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (833 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (12000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (4 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Blue Star",
                populationCap: (100000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (2500 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (1734 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (200 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (1667 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (50000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (5 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Giant",
                populationCap: (300000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (2917 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (2838 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (200 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (2778 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (100000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (7 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Supergiant",
                populationCap: (500000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (3333 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (4414 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (200 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (2778 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (200000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (10 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Unlabeled1",
                populationCap: (700000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (3750 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (6306 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (200 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (2778 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (300000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (20 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );

        planetDefaultStats.push(
            PlanetDefaultStats({
                label: "Unlabeled2",
                populationCap: (800000000 * arenaConstants().MODIFIERS.popCap) / 100,
                populationGrowth: (4167 * arenaConstants().MODIFIERS.popGrowth) / 100,
                range: (8829 * arenaConstants().MODIFIERS.range) / 100,
                speed: (75 * arenaConstants().MODIFIERS.speed) / 100,
                defense: (200 * arenaConstants().MODIFIERS.defense) / 100,
                silverGrowth: (2778 * arenaConstants().MODIFIERS.silverGrowth) / 100,
                silverCap: (400000000 * arenaConstants().MODIFIERS.silverCap) / 100,
                barbarianPercentage: (25 * arenaConstants().MODIFIERS.barbarianPercentage) / 100
            })
        );
    }

    function initializeUpgrades() public {
        Upgrade[4][3] storage upgrades = upgrades();

        // defense
        upgrades[uint256(UpgradeBranch.DEFENSE)][0] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 100,
            defMultiplier: 120
        });
        upgrades[uint256(UpgradeBranch.DEFENSE)][1] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 100,
            defMultiplier: 120
        });
        upgrades[uint256(UpgradeBranch.DEFENSE)][2] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 100,
            defMultiplier: 120
        });
        upgrades[uint256(UpgradeBranch.DEFENSE)][3] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 100,
            defMultiplier: 120
        });

        // range
        upgrades[uint256(UpgradeBranch.RANGE)][0] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 125,
            speedMultiplier: 100,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.RANGE)][1] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 125,
            speedMultiplier: 100,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.RANGE)][2] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 125,
            speedMultiplier: 100,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.RANGE)][3] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 125,
            speedMultiplier: 100,
            defMultiplier: 100
        });

        // speed
        upgrades[uint256(UpgradeBranch.SPEED)][0] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 175,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.SPEED)][1] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 175,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.SPEED)][2] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 175,
            defMultiplier: 100
        });
        upgrades[uint256(UpgradeBranch.SPEED)][3] = Upgrade({
            popCapMultiplier: 120,
            popGroMultiplier: 120,
            rangeMultiplier: 100,
            speedMultiplier: 175,
            defMultiplier: 100
        });
    }
}
