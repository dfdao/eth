
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";

// External contract imports
import {DFWhitelistFacet} from "../facets/DFWhitelistFacet.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";
import {WithArenaStorage, ArenaStorage, ArenaConstants, TournamentStorage} from "../libraries/LibArenaStorage.sol";

// Type imports
import {Player, ArenaPlayerInfo} from "../DFTypes.sol";

contract DFTeamFacet is WithStorage, WithArenaStorage {
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

    modifier onlyTeamsEnabled() {
        require(arenaConstants().TEAMS_ENABLED, "teams are disabled");
        _;
    }

    function joinTeam(uint256 team) public onlyWhitelisted onlyTeamsEnabled {
        assignTeam(msg.sender, team);
    }

    function setTeam(address playerAddress, uint256 team) public onlyAdmin onlyTeamsEnabled {
        assignTeam(playerAddress, team);
    }

    function assignTeam(address playerAddress, uint256 team) private {
        require(team < arenaConstants().NUM_TEAMS, "invalid team");

        Player memory player = gs().players[playerAddress];
        ArenaPlayerInfo storage ArenaPlayer = arenaStorage().arenaPlayerInfo[playerAddress];

        require(player.isInitialized, "player not initialized");

        address[] storage storedTeam = arenaStorage().teams[team];

        ArenaPlayer.team = team;
        storedTeam.push(playerAddress);
    }
}