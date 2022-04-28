// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Type imports
import {
    Planet, 
    PlanetExtendedInfo, 
    PlanetExtendedInfo2, 
    PlanetEventMetadata, 
    PlanetDefaultStats, 
    Upgrade, 
    RevealedCoords, 
    Player, 
    ArrivalData, 
    Artifact,
    ArenaPlanetInfo,
    ArenaPlayerInfo,
    Modifiers,
    Spaceships
} from "../DFTypes.sol";

struct ArenaStorage {
    address[] winners;
    bool gameover;
    mapping(uint256 => ArenaPlanetInfo) arenaPlanetInfo;
    uint256[] spawnPlanetIds;
    uint256[] targetPlanetIds;

    uint256 moveCap;
    mapping(address => ArenaPlayerInfo) arenaPlayerInfo;
    uint256 START_TIME;
    uint256 END_TIME;
}

struct ArenaConstants {
    bool TARGET_PLANETS;
    uint256 TARGET_PLANET_HOLD_BLOCKS_REQUIRED;
    bool MANUAL_SPAWN;

    bytes32 CONFIG_HASH;

    Modifiers MODIFIERS;
    Spaceships SPACESHIPS;
    uint8 CLAIM_VICTORY_ENERGY_PERCENTAGE;

}

library LibArenaStorage {
    // Storage are structs where the data gets updated throughout the lifespan of the game
    bytes32 constant ARENA_STORAGE_POSITION = keccak256("darkforest.storage.arena");
    bytes32 constant ARENA_CONSTANTS_POSITION = keccak256("darkforest.constants.arena");

    function arenaStorage() internal pure returns (ArenaStorage storage gs) {
        bytes32 position = ARENA_STORAGE_POSITION;
        assembly {
            gs.slot := position
        }
    }

     function arenaConstants() internal pure returns (ArenaConstants storage gs) {
        bytes32 position = ARENA_CONSTANTS_POSITION;
        assembly {
            gs.slot := position
        }
    }
}

contract WithArenaStorage {
    function arenaStorage() internal pure returns (ArenaStorage storage) {
        return LibArenaStorage.arenaStorage();
    }
    function arenaConstants() internal pure returns (ArenaConstants storage) {
        return LibArenaStorage.arenaConstants();
    }
    
}
