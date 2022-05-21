// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";

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
    ArenaCreateRevealPlanetArgs,
    ArenaPlanetInfo
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

    function getWinners() public view returns (address[] memory) {
        return arenaStorage().winners;
    }

    function getGameover() public view returns (bool) {
        return arenaStorage().gameover;
    }

    function getEndTime() public view returns (uint256) {
        return arenaStorage().endTime;
    }

    function getRoundDuration() public view returns (uint256) {
        require(arenaStorage().gameover && arenaStorage().endTime > 0, "game is not yet over");
        return arenaStorage().endTime - arenaConstants().START_TIME;
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

    function getInitPlanets() public view returns (ArenaCreateRevealPlanetArgs[] memory ret) {
        uint256[] memory initPlanetIds = arenaConstants().INIT_PLANET_IDS;

        ret = new ArenaCreateRevealPlanetArgs[](initPlanetIds.length);
        for(uint256 i = 0; i < initPlanetIds.length; i++) {
            ret[i] = arenaStorage().initPlanets[initPlanetIds[i]];
        }
    }
}
