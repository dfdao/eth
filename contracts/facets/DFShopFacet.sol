// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";
import {WithArenaStorage} from "../libraries/LibArenaStorage.sol";
import {LibArtifactUtils} from "../libraries/LibArtifactUtils.sol";

// External contract imports
import {DFArtifactFacet} from "./DFArtifactFacet.sol";

// Type imports
import {Player, Artifact, ArtifactRarity, ArtifactType, Biome, DFTCreateArtifactArgs, DFPFindArtifactArgs} from "../DFTypes.sol";

contract DFShopFacet is WithStorage, WithArenaStorage {
    event ArtifactPurchased(address buyer, uint256 tokenId, uint256 planetId);
    event SpaceshipPurchased(address buyer, uint256 tokenId, uint256 planetId);

    function purchaseArtifact(
        ArtifactType artifactType,
        ArtifactRarity rarity,
        uint256 locationId
    ) public {
        Player storage player = gs().players[msg.sender];

        Artifact memory artifact = DFArtifactFacet(address(this)).createArtifact(
            DFTCreateArtifactArgs({
                tokenId: gs().miscNonce++,
                discoverer: msg.sender,
                planetId: locationId,
                rarity: rarity,
                biome: Biome.Ocean,
                artifactType: artifactType,
                owner: msg.sender,
                // Only used for spaceships
                controller: address(0)
            })
        );

        require(
            !LibArtifactUtils.isSpaceship(artifactType) &&
                !LibArtifactUtils.isCube(artifact),
            "cannot create artifact of this type"
        );

        uint256 price = getArtifactPrice(artifactType,rarity);
        require(player.score >= price, "not enough silver to purchase");

        gs().artifacts[artifact.id] = artifact;

        player.score -= price;

        emit ArtifactPurchased(msg.sender, artifact.id, locationId);
    }

    function purchaseSpaceship(ArtifactType artifactType, uint256 planetId) public {
        bool isSpaceship = LibArtifactUtils.isSpaceship(artifactType);
        Player storage player = gs().players[msg.sender];

        require(isSpaceship, "is not a spaceeship");

        uint256 price = getSpaceshipPrice(artifactType);
        require(player.score >= price, "not enough silver to buy spaceship");
        uint256 spaceshipId = LibArtifactUtils.createAndPlaceSpaceship(
            planetId,
            msg.sender,
            artifactType
        );
        player.score -= price;
        emit SpaceshipPurchased(msg.sender, spaceshipId, planetId);
    }

    function getArtifactPrice(ArtifactType artifactType, ArtifactRarity rarity)
        public
        view
        returns (uint256)
    {
        uint256 typePrice = 0;
        if (artifactType == ArtifactType.Monolith) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.Monolith;
        } else if (artifactType == ArtifactType.Colossus) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.Colossus;
        } else if (artifactType == ArtifactType.Pyramid) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.Pyramid;
        } else if (artifactType == ArtifactType.Wormhole) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.Wormhole;
        } else if (artifactType == ArtifactType.PlanetaryShield) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.PlanetaryShield;
        } else if (artifactType == ArtifactType.PhotoidCannon) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.PhotoidCannon;
        } else if (artifactType == ArtifactType.BloomFilter) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.BloomFilter;
        } else if (artifactType == ArtifactType.BlackDomain) {
            typePrice = arenaConstants().ARTIFACT_TYPE_PRICES.BlackDomain;
        }

        uint256 rarityPrice = 0;
        if (rarity == ArtifactRarity.Common) {
            rarityPrice = arenaConstants().ARTIFACT_RARITY_PRICES.Common;
        } else if (rarity == ArtifactRarity.Rare) {
            rarityPrice = arenaConstants().ARTIFACT_RARITY_PRICES.Rare;
        } else if (rarity == ArtifactRarity.Epic) {
            rarityPrice = arenaConstants().ARTIFACT_RARITY_PRICES.Epic;
        } else if (rarity == ArtifactRarity.Legendary) {
            rarityPrice = arenaConstants().ARTIFACT_RARITY_PRICES.Legendary;
        } else if (rarity == ArtifactRarity.Mythic) {
            rarityPrice = arenaConstants().ARTIFACT_RARITY_PRICES.Mythic;
        }

        return typePrice * rarityPrice;
    }

    function getSpaceshipPrice(ArtifactType spaceship) public view returns (uint256) {
        if (spaceship == ArtifactType.ShipMothership) {
            return arenaConstants().SPACESHIP_PRICES.ShipMothership;
        } else if (spaceship == ArtifactType.ShipCrescent) {
            return arenaConstants().SPACESHIP_PRICES.ShipCrescent;
        } else if (spaceship == ArtifactType.ShipWhale) {
            return arenaConstants().SPACESHIP_PRICES.ShipWhale;
        } else if (spaceship == ArtifactType.ShipGear) {
            return arenaConstants().SPACESHIP_PRICES.ShipGear;
        } else if (spaceship == ArtifactType.ShipTitan) {
            return arenaConstants().SPACESHIP_PRICES.ShipTitan;
        }
        return 0;
    }
}
