// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibPlanet} from "../libraries/LibPlanet.sol";

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
import {WithArenaStorage, ArenaStorage, ArenaConstants} from "./LibArenaStorage.sol";

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
    PlanetExtendedInfo2
} from "../DFTypes.sol";

// SHOULD WE SPLIT THESE DATA STRUCTURES UP? THEY ARE COMING FROM ALL OVER

// Updated types
struct ArenaAdminCreatePlanetArgs {
    uint256 location;
    uint256 perlin;
    uint256 level;
    PlanetType planetType;
    bool requireValidLocationId;
    bool isTargetPlanet;
    bool isSpawnPlanet;
}

contract DFArenaFacet is WithStorage, WithArenaStorage {
    event AdminPlanetCreated(uint256 loc);
    event TargetPlanetInvaded(address player, uint256 loc);
    event Gameover(address winner);
    event PlayerInitialized(address player, uint256 loc);


    modifier onlyAdmin() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    modifier notPaused() {
        require(!gs().paused, "Game is paused");
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

    modifier targetPlanetsActive() {
        require(arenaConstants().TARGET_PLANETS, "target planets are disabled");
        _;
    }

    // FUNCTIONS TO REPLACE
    function createPlanet(ArenaAdminCreatePlanetArgs memory args) public onlyAdmin {
        require(gameConstants().ADMIN_CAN_ADD_PLANETS, "admin can no longer add planets");
        if (args.requireValidLocationId) {
            require(LibGameUtils._locationIdValid(args.location), "Not a valid planet location");
        }
        SpaceType spaceType = LibGameUtils.spaceTypeFromPerlin(args.perlin);
        LibPlanet._initializePlanet(
            DFPInitPlanetArgs(
                args.location,
                args.perlin,
                args.level,
                gameConstants().TIME_FACTOR_HUNDREDTHS,
                spaceType,
                args.planetType,
                false
            )
        );
        if (args.isTargetPlanet) {
            require(arenaConstants().TARGET_PLANETS, "admin cannot create target planets");
            arenaStorage().targetPlanetIds.push(args.location);
            arenaStorage().targetPlanets[args.location] = true;
        }

        if (args.isSpawnPlanet) {
            require(arenaConstants().MANUAL_SPAWN, "admin cannot create spawn planets");

            arenaStorage().spawnPlanetIds.push(args.location);
            arenaStorage().spawnPlanets[args.location] = true;
        }

        gs().planetIds.push(args.location);
        gs().initializedPlanetCountByLevel[args.level] += 1;

        emit AdminPlanetCreated(args.location);
    }

    function initializePlayer(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[8] memory _input
    ) public onlyWhitelisted returns (uint256) {
        uint256 _location = _input[0];
        uint256 _perlin = _input[1];
        uint256 _radius = _input[2];

        if(arenaConstants().MANUAL_SPAWN) {
            // TODO: Move this logic to LibPlanet initializeManualSpawn or smthing
            uint256[] memory spawnIds = arenaStorage().spawnPlanetIds;
            bool foundSpawn = false;

            // Check planets are already intialized by createPlanets
            require(spawnIds.length > 0, "No manual spawn planets");

            for (uint i = 0; i < spawnIds.length; i++) {
                // console.log('testing revealed Id %s', spawnIds[i]);
                Planet storage _planet = gs().planets[spawnIds[i]];
                if(_location == spawnIds[i] && !_planet.isHomePlanet) {
                    LibPlanet.initializePlanet(_a, _b, _c, _input, true);
                    foundSpawn = true;
                    // get planet from storage and set it as homePlanet
                    _planet.isHomePlanet = true;
                    break;
                }
            }
            require(foundSpawn, "No available manual spawn planet found");                
        }
        else {
            LibPlanet.initializePlanet(_a, _b, _c, _input, true);
        }

        // Checks player hasn't already initialized and confirms PERLIN.
        require(LibPlanet.checkPlayerInit(_location, _perlin, _radius));

        // Initialize player data
        gs().playerIds.push(msg.sender);
        gs().players[msg.sender] = Player(
            true,
            msg.sender,
            block.timestamp,
            _location,
            0,
            0,
            0,
            gameConstants().SPACE_JUNK_LIMIT,
            false
        );

        LibGameUtils.updateWorldRadius();
        emit PlayerInitialized(msg.sender, _location);
        return _location;
    }

    // FUNCTIONS TO ADD
    function invadeTargetPlanet(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[9] memory _input
    ) public onlyWhitelisted notPaused targetPlanetsActive {
        DFCoreFacet(address(this)).checkRevealProof(_a, _b, _c, _input);

        uint256 locationId = _input[0];

        LibPlanet.refreshPlanet(locationId);
        Planet memory planet = gs().planets[locationId];
        PlanetExtendedInfo memory planetExtendedInfo = gs().planetsExtendedInfo[locationId];
        PlanetExtendedInfo2 storage planetExtendedInfo2 = gs().planetsExtendedInfo2[locationId];

        require(!planetExtendedInfo.destroyed, "planet is destroyed");
        require(planetExtendedInfo2.invader == address(0), "planet is already invaded");
        require(planetExtendedInfo2.capturer == address(0), "planet has already been captured");
        require(planet.owner == msg.sender, "you can only invade planets you own");

        planetExtendedInfo2.invader = msg.sender;
        planetExtendedInfo2.invadeStartBlock = block.number;

        emit TargetPlanetInvaded(msg.sender, locationId);
    }

    function claimTargetPlanetVictory(uint256 locationId)
        public
        onlyWhitelisted
        notPaused
        targetPlanetsActive
    {
        require(!arenaStorage().gameover, "cannot claim victory when game is over");

        LibPlanet.refreshPlanet(locationId);
        Planet memory planet = gs().planets[locationId];
        PlanetExtendedInfo memory planetExtendedInfo = gs().planetsExtendedInfo[locationId];
        PlanetExtendedInfo2 memory planetExtendedInfo2 = gs().planetsExtendedInfo2[locationId];

        require(
            arenaStorage().targetPlanets[locationId],
            "you can only claim victory with a target planet"
        );
        
        require(planet.owner == msg.sender, "you can only claim victory with planets you own");
        require(!planetExtendedInfo.destroyed, "planet is destroyed");
        require(
            planetExtendedInfo2.invader != address(0),
            "you must invade the planet before capturing"
        );

        require(
            planetExtendedInfo2.invadeStartBlock +
                arenaConstants().TARGET_PLANET_HOLD_BLOCKS_REQUIRED <=
                block.number,
            "you have not held the planet long enough to claim victory with it"
        );

        arenaStorage().gameover = true;
        arenaStorage().winner = msg.sender;
        emit Gameover(msg.sender);
    }

    /*
    initAddress is the address of DFInitialize.sol
    initData is an object that is defined in ts as
        initFunctionCall = initInterface.encodeFunctionData('init', [
            whitelistEnabled,
            artifactBaseURI,
            initializers,
        ]);
  */
    function createArena(address initAddress, bytes calldata initData) public {
        /*
        we need to create a lobby with vanilla initData (because that is what the lobby requires)
            then we need to upgrade the storage structs with our new variables
            then we need to reinitialize the new storage struct with the full initData
            
        Create a new lobby -- how can we do so if the initData type matches the 
                           --  we need to change the typing of storage structs first?
        Get the lobby's address
        Create an array of facetCuts of length (functions to replace + functions to add)

        Fill the facetCuts array with all functions to replace in vanilla lobby
            - how do we know which function selector is correct? Is there a way to compare function names to derive the function selector?

        Fill the facetCuts array with all functions to add from our own facets

        Cut all changes into the diamond

        update structs at storage locations -- 
            - how can we do this without rewriting the LibStorage file with rebuilt structs?
            - Okay I'm pretty sure that we need to write new structs and replace them using the upgrade too

        Emit ArenaCreated event
    */
    }

    // Getters 
    function targetPlanetIds(uint256 idx) public view returns (uint256) {
        return arenaStorage().targetPlanetIds[idx];
    }

    function spawnPlanetIds(uint256 idx) public view returns (uint256) {
        return arenaStorage().spawnPlanetIds[idx];
    }

    function targetPlanets(uint256 location) public view returns (bool) {
        return arenaStorage().targetPlanets[location];
    }

    function spawnPlanets(uint256 location) public view returns (bool) {
        return arenaStorage().spawnPlanets[location];
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

    function getWinner() public view returns (address) {
        return arenaStorage().winner;
    }

    function getGameover() public view returns (bool) {
        return arenaStorage().gameover;
    }
    
    function getArenaConstants() public pure returns (ArenaConstants memory) {
        return arenaConstants();
    }
}