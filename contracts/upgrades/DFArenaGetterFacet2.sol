// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Storage imports
import {ArenaConstants, WithArenaStorage} from "./LibArenaUpgradeStorage.sol";

contract DFArenaGetterFacet2 is WithArenaStorage {

    function getArenaConstants() public pure returns (ArenaConstants memory) {
        return arenaConstants();
    }
}