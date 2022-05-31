// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";

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
import {WithArenaStorage, ArenaStorage, ArenaConstants, TournamentStorage} from "../libraries/LibArenaStorage.sol";
import {
    SpaceType, 
    DFPInitPlanetArgs, 
    AdminCreatePlanetArgs, 
    Artifact, 
    ArtifactType, 
    Player, 
    Planet, 
    PlanetType, 
    PlanetExtendedInfo, 
    PlanetExtendedInfo2,
    ArenaPlanetInfo,
    AllConstants,
    ArenaPlayerInfo
} from "../DFTypes.sol";

contract DFArenaGetterFacet is WithStorage, WithArenaStorage {

    function targetPlanetIds(uint256 idx) public view returns (uint256) {
        return arenaStorage().targetPlanetIds[idx];
    }

    function spawnPlanetIds(uint256 idx) public view returns (uint256) {
        return arenaStorage().spawnPlanetIds[idx];
    }

    function planetsArenaInfo(uint256 key) public view returns (ArenaPlanetInfo memory) {
        return arenaStorage().arenaPlanetInfo[key];
    }
    
    function bulkGetPlanetsArenaInfoByIds(uint256[] calldata ids)
        public
        view
        returns (ArenaPlanetInfo[] memory ret)
    {
        ret = new ArenaPlanetInfo[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            ret[i] = arenaStorage().arenaPlanetInfo[ids[i]];
        }
    }
    
    function getNTargetPlanets() public view returns (uint256) {
        return arenaStorage().targetPlanetIds.length;
    }

    function getNSpawnPlanets() public view returns (uint256) {
        return arenaStorage().spawnPlanetIds.length;
    }

    function bulkGetTargetPlanetIds(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (uint256[] memory ret)
    {
        // return slice of targetPlanetIds array from startIdx through endIdx - 1
        ret = new uint256[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = arenaStorage().targetPlanetIds[i];
        }
    }

    function bulkGetSpawnPlanetIds(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (uint256[] memory ret)
    {
        // return slice of spawnPlanetIds array from startIdx through endIdx - 1
        ret = new uint256[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = arenaStorage().spawnPlanetIds[i];
        }
    }

    function arenaPlayers(address key) public view returns (ArenaPlayerInfo memory) {
        return arenaStorage().arenaPlayerInfo[key];
    }

    function bulkGetArenaPlayers(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (ArenaPlayerInfo[] memory ret)
    {
        // return array of planets corresponding to planetIds[startIdx] through planetIds[endIdx - 1]
        ret = new ArenaPlayerInfo[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = arenaStorage().arenaPlayerInfo[gs().playerIds[i]];
        }
    }

    function getWinners() public view returns (address[] memory) {
        return arenaStorage().winners;
    }

    function getGameover() public view returns (bool) {
        return arenaStorage().gameover;
    }

    function getStartTime() public view returns (uint256) {
        return arenaStorage().startTime;
    }

    function getEndTime() public view returns (uint256) {
        return arenaStorage().endTime;
    }

    function getRoundDuration() public view returns (uint256) {
        if(arenaStorage().startTime == 0) {
            return 0;
        }
        if(arenaStorage().endTime == 0) {
            return block.timestamp - arenaStorage().startTime;
        }
        return arenaStorage().endTime - arenaStorage().startTime;
    }

    function getArenaConstants() public pure returns (ArenaConstants memory) {
        return arenaConstants();
    }

    function getMatches() public view returns (address[] memory) {
        return tournamentStorage().matches;
    }

    function getNumMatches() public view returns (uint256) {
        return tournamentStorage().numMatches;
    }

    function getMatch(uint256 id) public view returns (address) {
        return tournamentStorage().matches[id];
    }

    function getInitPlanetHashes() public view returns (bytes32[] memory) {
        bytes32[] memory initPlanetIds = arenaConstants().INIT_PLANET_HASHES;
        return initPlanetIds;
    }

    function getAllConstants() public view returns (AllConstants memory) {
        uint256[10] memory thresholds;
        
        for (uint i = 0; i < 10; i += 1) {
            thresholds[i] = gs().planetLevelThresholds[i];
        }

        AllConstants memory a = AllConstants({   
            // SNARK keys and perlin params
            DISABLE_ZK_CHECKS: snarkConstants().DISABLE_ZK_CHECKS,
            PLANETHASH_KEY: snarkConstants().PLANETHASH_KEY,
            SPACETYPE_KEY: snarkConstants().SPACETYPE_KEY,
            BIOMEBASE_KEY: snarkConstants().BIOMEBASE_KEY,
            PERLIN_MIRROR_X: snarkConstants().PERLIN_MIRROR_X,
            PERLIN_MIRROR_Y: snarkConstants().PERLIN_MIRROR_Y,
            PERLIN_LENGTH_SCALE: snarkConstants().PERLIN_LENGTH_SCALE,
            PLANET_LEVEL_THRESHOLDS: thresholds,
            ADMIN_CAN_ADD_PLANETS: gameConstants().ADMIN_CAN_ADD_PLANETS,
            WORLD_RADIUS_LOCKED: gameConstants().WORLD_RADIUS_LOCKED, 
            WORLD_RADIUS_MIN: gameConstants().WORLD_RADIUS_MIN,
            // Game config
            MAX_NATURAL_PLANET_LEVEL: gameConstants().MAX_NATURAL_PLANET_LEVEL, 
            TIME_FACTOR_HUNDREDTHS:  gameConstants().TIME_FACTOR_HUNDREDTHS,        
            PERLIN_THRESHOLD_1: gameConstants().PERLIN_THRESHOLD_1,    
            PERLIN_THRESHOLD_2: gameConstants().PERLIN_THRESHOLD_2,    
            PERLIN_THRESHOLD_3: gameConstants().PERLIN_THRESHOLD_3,    
            INIT_PERLIN_MIN: gameConstants().INIT_PERLIN_MIN, 
            INIT_PERLIN_MAX: gameConstants().INIT_PERLIN_MAX, 
            SPAWN_RIM_AREA: gameConstants().SPAWN_RIM_AREA, 
            BIOME_THRESHOLD_1: gameConstants().BIOME_THRESHOLD_1,   
            BIOME_THRESHOLD_2: gameConstants().BIOME_THRESHOLD_2,   
            PLANET_RARITY: gameConstants().PLANET_RARITY, 
            PLANET_TRANSFER_ENABLED: gameConstants().PLANET_TRANSFER_ENABLED,
            PHOTOID_ACTIVATION_DELAY: gameConstants().PHOTOID_ACTIVATION_DELAY, 
            LOCATION_REVEAL_COOLDOWN: gameConstants().LOCATION_REVEAL_COOLDOWN, 
            // PLANET_TYPE_WEIGHTS: gameConstants().PLANET_TYPE_WEIGHTS,
            SILVER_SCORE_VALUE: gameConstants().SILVER_SCORE_VALUE,
            ARTIFACT_POINT_VALUES: gameConstants().ARTIFACT_POINT_VALUES,       
            // Space Junk
            SPACE_JUNK_ENABLED: gameConstants().SPACE_JUNK_ENABLED,
            SPACE_JUNK_LIMIT: gameConstants().SPACE_JUNK_LIMIT,
            PLANET_LEVEL_JUNK: gameConstants().PLANET_LEVEL_JUNK,   
            ABANDON_SPEED_CHANGE_PERCENT: gameConstants().ABANDON_SPEED_CHANGE_PERCENT,
            ABANDON_RANGE_CHANGE_PERCENT: gameConstants().ABANDON_RANGE_CHANGE_PERCENT,
            // Capture Zones
            CAPTURE_ZONES_ENABLED: gameConstants().CAPTURE_ZONES_ENABLED,       
            CAPTURE_ZONE_COUNT: gameConstants().CAPTURE_ZONE_COUNT,    
            CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL:  gameConstants().CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL,
            CAPTURE_ZONE_RADIUS: gameConstants().CAPTURE_ZONE_RADIUS,     
            CAPTURE_ZONE_PLANET_LEVEL_SCORE: gameConstants().CAPTURE_ZONE_PLANET_LEVEL_SCORE,
            CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED: gameConstants().CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED,
            CAPTURE_ZONES_PER_5000_WORLD_RADIUS: gameConstants().CAPTURE_ZONES_PER_5000_WORLD_RADIUS,
            // Game Storage 
            TOKEN_MINT_END_TIMESTAMP: gs().TOKEN_MINT_END_TIMESTAMP,
            TARGET_PLANETS: arenaConstants().TARGET_PLANETS,
            CLAIM_VICTORY_ENERGY_PERCENT: arenaConstants().CLAIM_VICTORY_ENERGY_PERCENT,
            MANUAL_SPAWN: arenaConstants().MANUAL_SPAWN,
            MODIFIERS: arenaConstants().MODIFIERS,
            SPACESHIPS: arenaConstants().SPACESHIPS,
            CONFIG_HASH: arenaConstants().CONFIG_HASH,
            NO_ADMIN: arenaConstants().NO_ADMIN,
            INIT_PLANET_HASHES: arenaConstants().INIT_PLANET_HASHES
        });

        return a;

    }
}
