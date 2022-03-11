// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Contract imports
import {Diamond} from "../vendor/Diamond.sol";

// Interface imports
import {IDiamondCut} from "../vendor/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../vendor/interfaces/IDiamondLoupe.sol";
import {IERC173} from "../vendor/interfaces/IERC173.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";

contract DFLobbyFacet is WithStorage {
    event LobbyCreated(address ownerAddress, address lobbyAddress);

    /*
    initAddress is the address of DFInitialize.sol
    initData is an object that is defined in ts as
        initFunctionCall = initInterface.encodeFunctionData('init', [
            whitelistEnabled,
            artifactBaseURI,
            initializers,
        ]);
  */
    function createLobby(address initAddress, bytes calldata initData) public {

        // the original diamond's address
        address diamondAddress = gs().diamondAddress;

        // IDiamondCut.diamondCut.selector is the interface ID of the diamondCut function
        // diamondCutAddress is the facet address of the diamondCut function
        address diamondCutAddress =
            IDiamondLoupe(diamondAddress).facetAddress(IDiamondCut.diamondCut.selector);
        
        // creates a new diamond owned by the original diamond address located at diamondcutaddress
        Diamond lobby = new Diamond(diamondAddress, diamondCutAddress);

        // facets are all the facets in the original diamond
        IDiamondLoupe.Facet[] memory facets = IDiamondLoupe(diamondAddress).facets();

        // facetCut is an array of facet cut structs that align with the facets from the original diamondAddress
        IDiamondCut.FacetCut[] memory facetCut = new IDiamondCut.FacetCut[](facets.length - 1);
        
        uint256 cutIdx = 0;
        // loop through all of the facets. If the facetAddress is the diamond cut address, skip.
        // If not, add information about the original facet to the array of facet cuts
        for (uint256 i = 0; i < facets.length; i++) {
            if (facets[i].facetAddress != diamondCutAddress) {
                facetCut[cutIdx] = IDiamondCut.FacetCut({
                    facetAddress: facets[i].facetAddress,
                    action: IDiamondCut.FacetCutAction.Add,
                    functionSelectors: facets[i].functionSelectors
                });
                cutIdx++;
            }
        }

        // cut a new diamond that contains all the original facets, DFInitialize function, 
        // and contains provided initializers
        IDiamondCut(address(lobby)).diamondCut(facetCut, initAddress, initData);

        // give ownership to the msg sender
        IERC173(address(lobby)).transferOwnership(msg.sender);

        emit LobbyCreated(msg.sender, address(lobby));
    }
}
