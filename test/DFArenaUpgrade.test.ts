import { expect } from "chai";
import { fixtureLoader, makeRevealArgs } from "./utils/TestUtils";
import { baseGameFixture, World } from "./utils/TestWorld";
import { ADMIN_PLANET_CLOAKED, arenaInitializers, initializers } from "./utils/WorldConstants";
import hre from 'hardhat';
import { DarkForest, LobbyCreatedEvent } from "@darkforest_eth/contracts/typechain/DarkForest";
// Note: The deployed addresses are written to the contracts package on any deploy, including for testing
// Beware that running tests will overwrite your deployed addresses
import { INIT_ADDRESS } from "@darkforest_eth/contracts" 
import InitABI from "@darkforest_eth/contracts/abis/DFInitialize.json";
import { Contract } from "ethers";
import { deployUpgradeDiamondInit } from "../tasks/utils";
import { deployArenaCoreFacet, deployArenaGetterFacet, deployLibraries } from "../tasks/utils";
import { DiamondChanges } from "../utils/diamond";

describe.skip('Dark Forest Arena Upgrade', function (){
    describe("Lobby with Initializer", async function() {
        let world: World;
        let lobby: DarkForest;

        before('load fixture', async function () {
            world = await fixtureLoader(baseGameFixture);
          });
        
        it('Arena function on Diamond does not exist', async function () {
            const perlin = 20;
            const level = 5;
            const planetType = 1; // asteroid field
            const x = 10;
            const y = 20;
            await expect(world.contract.createArenaPlanet({
                location: ADMIN_PLANET_CLOAKED.id,
                perlin,
                level,
                planetType,
                requireValidLocationId: false,
                isTargetPlanet: false,
                isSpawnPlanet: true,
            })).to.be.revertedWith('Diamond: Function does not exist');
        });
    
        it('Creates a new lobby with msg.sender as owner', async function () {
    
            // Mirroring client code in CreateLobby.tsx
            const artifactBaseURI = '';
            const initInterface = Contract.getInterface(InitABI);
            const initAddress = INIT_ADDRESS;
            const initFunctionCall = initInterface.encodeFunctionData('init', [
              false, // WHITELIST_ENABLED
              artifactBaseURI,
              initializers,
            ]);
    
            // Make Lobby
            const tx = await world.user1Core.createLobby(initAddress,initFunctionCall);
            const rc = await tx.wait();
            if(!rc.events) throw Error ("No event occurred");
    
            const event = rc.events.find(event => event.event === 'LobbyCreated') as LobbyCreatedEvent;
            expect(event.args.ownerAddress).to.equal(world.user1.address);
    
            const lobbyAddress = event.args.lobbyAddress;
    
            if(!lobbyAddress) throw Error ("No lobby address found");
    
            // Connect to Lobby Diamond and check ownership 
            lobby = await hre.ethers.getContractAt('DarkForest', lobbyAddress);
            expect(await lobby.owner()).to.equal(world.user1.address);
        });
    
        it('new Lobby has same initialzer value as initial Diamond', async function () {
            expect((await lobby.getGameConstants()).ADMIN_CAN_ADD_PLANETS).to.equal(initializers.ADMIN_CAN_ADD_PLANETS);
        });

        it('new Lobby is upgraded with Arena facets and Arena initializer', async function () {
            // Deploy Arena initializer
            
            // Make sure user1 is msg.sender
            lobby = lobby.connect(world.user1);

            const prevFacets = await lobby.facets();

            const changes = new DiamondChanges(prevFacets);
                    
            const libraries = await deployLibraries({}, hre);
          
            const diamondInit = await deployUpgradeDiamondInit({}, libraries, hre);
          
            const arenaCoreFacet = await deployArenaCoreFacet({}, libraries, hre);
            const arenaGetterFacet = await deployArenaGetterFacet({}, libraries, hre);
          
            const arenaDiamondCuts = [
              // Note: The `diamondCut` is omitted because it is cut upon deployment
              ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
              ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
            ];
          
            const toCut = [...arenaDiamondCuts];

            const initAddress = diamondInit.address;
            const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
              false,
              "",
              arenaInitializers,
            ]);
          
            const arenaTx = await lobby.diamondCut(toCut, initAddress, initFunctionCall);
            const arenaReceipt = await arenaTx.wait();
            if (!arenaReceipt.status) {
              throw Error(`Diamond cut failed: ${arenaTx.hash}`);
            }
          
            console.log('Completed diamond cut');
        });

        it('Arena function on Diamond does exist', async function () {
            const perlin = 20;
            const level = 5;
            const planetType = 1; // asteroid field
            const x = 10;
            const y = 20;
            await lobby.createArenaPlanet({
                location: ADMIN_PLANET_CLOAKED.id,
                perlin,
                level,
                planetType,
                requireValidLocationId: false,
                isTargetPlanet: false,
                isSpawnPlanet: true,
            });

            await lobby.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));
  
            const numSpawnPlanets = await lobby.getNSpawnPlanets();
            expect(numSpawnPlanets).to.equal(1);
        
            const spawnPlanet = await lobby.spawnPlanetIds(0);
        
            expect(spawnPlanet).to.equal(ADMIN_PLANET_CLOAKED.id);
        });
    });

    describe("Bad Lobby (no initializer)", async function() {
        let world: World;
        let lobby: DarkForest;

        before('load fixture', async function () {
            world = await fixtureLoader(baseGameFixture);
          });
        
        it('Creates a new lobby with msg.sender as owner', async function () {
            // from tasks/upgrades.ts 
            const initAddress = hre.ethers.constants.AddressZero;
            const initFunctionCall = '0x';
    
            // Make Lobby
            const tx = await world.user1Core.createLobby(initAddress,initFunctionCall);
            const rc = await tx.wait();
            if(!rc.events) throw Error ("No event occurred");
    
            const event = rc.events.find(event => event.event === 'LobbyCreated') as LobbyCreatedEvent;
            expect(event.args.ownerAddress).to.equal(world.user1.address);
    
            const lobbyAddress = event.args.lobbyAddress;
    
            if(!lobbyAddress) throw Error ("No lobby address found");
    
            // Connect to Lobby Diamond and check ownership 
            lobby = await hre.ethers.getContractAt('DarkForest', lobbyAddress);
            expect(await lobby.owner()).to.equal(world.user1.address);
        });
    
        it('new Lobby does not have same constant as initial Diamond', async function () {
            expect((await lobby.getGameConstants()).ADMIN_CAN_ADD_PLANETS).to.not.equal(initializers.ADMIN_CAN_ADD_PLANETS);
        });

    });



});
