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
import {ArenaPlayerInfo, ArenaStorage, ArenaConstants, WithArenaStorage} from "./LibArenaUpgradeStorage.sol";

import {SpaceType, DFPInitPlanetArgs, AdminCreatePlanetArgs, Artifact, ArtifactType, Player, Planet, PlanetType, PlanetExtendedInfo, PlanetExtendedInfo2} from "../DFTypes.sol";

contract DFArenaGetterFacet2 is WithStorage, WithArenaStorage {
    function getPlayerMove(address playerAddress) public view returns (uint256) {
        ArenaPlayerInfo memory player = arenaStorage().arenaPlayerInfo[playerAddress];
        return player.moves;
    }

    function getMoveCap() public view returns (uint256) {
        return arenaStorage().moveCap;
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

    function getArenaConstants() public pure returns (ArenaConstants memory) {
        return arenaConstants();
    }
}