// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";

// Contract imports
import {DiamondLoupeFacet} from "../vendor/facets/DiamondLoupeFacet.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";
import {WithArenaStorage, ArenaPlayerInfo} from "./LibArenaUpgradeStorage.sol";

contract DFMoveCapFacet is WithStorage, WithArenaStorage {
    event MoveCapChanged(uint256 moveCap);

    modifier onlyAdmin() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    modifier notPaused() {
        require(!gs().paused, "Game is paused");
        _;
    }

    function setMoveCap(uint256 newMoveCap) public onlyAdmin {
        arenaStorage().moveCap = newMoveCap;
        emit MoveCapChanged(newMoveCap);
    }

    function setPlayerMove(address playerAddress, uint256 newMove) public onlyAdmin {
        ArenaPlayerInfo storage player = arenaStorage().arenaPlayerInfo[playerAddress];
        player.moves = newMove;
    }

    function arenaMove(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[14] memory _input
    ) public notPaused {
        ArenaPlayerInfo storage player = arenaStorage().arenaPlayerInfo[msg.sender];
        if (arenaConstants().MOVE_CAP_ENABLED) {
            require(player.moves < arenaStorage().moveCap, "player cannot make any more moves");
        }

        bytes4 moveSelector = bytes4(
            keccak256(("move(uint256[2],uint256[2][2],uint256[2],uint256[14])"))
        );
        address facet = DiamondLoupeFacet(address(this)).facetAddress(moveSelector);
        bytes memory moveCall = abi.encodeWithSelector(moveSelector, _a, _b, _c, _input);
        (bool success, ) = address(facet).delegatecall(moveCall);
        require(success, "failed to execute move");

        player.moves ++;
    }
}