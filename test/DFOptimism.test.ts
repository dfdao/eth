import { ArtifactType } from '@darkforest_eth/types';
import { expect } from 'chai';
import { BigNumberish } from 'ethers';
import { conquerUnownedPlanet, increaseBlockchainTime, makeInitArgs, makeMoveArgs, makeRevealArgs, user1MintArtifactPlanet, ZERO_ADDRESS } from './utils/TestUtils';
import { initializeOptimismWorld, World } from './utils/TestWorld';
import { getStatSum } from './utils/TestUtils';
import {
  ADMIN_PLANET,
  ADMIN_PLANET_CLOAKED,
  initializers,
  INVALID_PLANET,
  INVALID_TOO_CLOSE_SPAWN,
  INVALID_TOO_FAR_SPAWN,
  LVL0_PLANET_DEEP_SPACE,
  LVL0_PLANET_OUT_OF_BOUNDS,
  LVL1_PLANET_NEBULA,
  SPAWN_PLANET_1,
  SPAWN_PLANET_2,
  OPTIMISM_GAS_LIMIT,
  ARTIFACT_PLANET_1,
  LVL3_SPACETIME_1,
  LVL3_SPACETIME_2,
  LVL0_PLANET_DEAD_SPACE,
  optimismInitializers
} from './utils/WorldConstants';

describe('DarkForestInit', function () {
  let world: World;

  beforeEach('load universe NO FIXTURE', async function () {
    world = await initializeOptimismWorld({initializers, whitelistEnabled: false});
  });

  it('initializes player successfully with the correct planet value', async function () {
    await expect(world.user1Core.initializePlayer(...makeInitArgs(SPAWN_PLANET_1),{gasLimit: OPTIMISM_GAS_LIMIT}))
      .to.emit(world.contract, 'PlayerInitialized')
      .withArgs(world.user1.address, SPAWN_PLANET_1.id.toString());

    const planetData = await world.contract.planets(SPAWN_PLANET_1.id);

    await expect((await world.contract.players(world.user1.address)).isInitialized).equal(true);
    expect(planetData.owner).to.equal(world.user1.address);
    expect(planetData.population).to.be.equal('50000');
    expect(planetData.populationCap).to.be.equal('100000');
    expect(planetData.planetType).to.be.equal(0); // regular planet
    expect(planetData.isHomePlanet).to.be.equal(true);
  });

});

describe.only('DarkForestArtifact', function () {
    let world: World;

    async function getArtifactsOnPlanet(world: World, locationId: BigNumberish) {
        return (await world.contract.getArtifactsOnPlanet(locationId))
          .map((metadata) => metadata.artifact)
          .filter((artifact) => artifact.artifactType < ArtifactType.ShipMothership);
      }
    
  
    beforeEach('load universe NO FIXTURE Optimism init', async function () {
      this.timeout(0);

      world = await initializeOptimismWorld({initializers: optimismInitializers, whitelistEnabled: false});

      await world.user1Core.initializePlayer(...makeInitArgs(SPAWN_PLANET_1),{gasLimit: OPTIMISM_GAS_LIMIT});
      console.log('after init player');
      console.log('time', (await world.user1Core.getGameConstants()).TIME_FACTOR_HUNDREDTHS.toNumber());
      await world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id, {gasLimit: OPTIMISM_GAS_LIMIT});
      await world.user2Core.initializePlayer(...makeInitArgs(SPAWN_PLANET_2), {gasLimit: OPTIMISM_GAS_LIMIT});
  
      // Conquer initial planets
      //// Player 1
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, ARTIFACT_PLANET_1);
      console.log(`here??`)
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL3_SPACETIME_1);
      //// Player 2
      await conquerUnownedPlanet(world, world.user2Core, SPAWN_PLANET_2, LVL3_SPACETIME_2);
      await increaseBlockchainTime();
  
      // Move the Gear ship into position
      const gearShip = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipGear
      );
      const gearId = gearShip?.artifact.id;
      await world.user1Core.move(
        ...makeMoveArgs(SPAWN_PLANET_1, ARTIFACT_PLANET_1, 100, 0, 0, gearId)
      );
      await increaseBlockchainTime();
      await world.user1Core.refreshPlanet(ARTIFACT_PLANET_1.id);
  
      // Conquer another planet for artifact storage
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL0_PLANET_DEAD_SPACE);


    });
  
    it('be able to mint artifact on ruins, activate/buff, deactivate/debuff', async function () {
        const statSumInitial = getStatSum(await world.contract.planets(ARTIFACT_PLANET_1.id));
    
        await user1MintArtifactPlanet(world.user1Core);
    
        const statSumAfterFound = getStatSum(await world.contract.planets(ARTIFACT_PLANET_1.id));
    
        // artifact should be on planet
        const artifactsOnPlanet = await getArtifactsOnPlanet(world, ARTIFACT_PLANET_1.id);
        expect(artifactsOnPlanet.length).to.be.equal(1);
    
        // artifact should be owned by contract
        expect(artifactsOnPlanet[0].discoverer).to.eq(world.user1.address);
    
        // let's update the planet to be one of the basic artifacts, so that
        // we know it's definitely going to buff the planet in some way. also,
        // this prevents the artifact from being one that requires valid parameter
        // in order to activate
        const updatedArtifact = Object.assign({}, artifactsOnPlanet[0]);
        updatedArtifact.artifactType = 0;
        await world.contract.updateArtifact(updatedArtifact);
    
        // planet should be buffed after discovered artifact
        await world.user1Core.activateArtifact(ARTIFACT_PLANET_1.id, artifactsOnPlanet[0].id, 0);
        const statSumAfterActivation = getStatSum(await world.contract.planets(ARTIFACT_PLANET_1.id));
    
        // planet buff should be removed after artifact deactivated
        await world.user1Core.deactivateArtifact(ARTIFACT_PLANET_1.id);
        const statSumAfterDeactivate = getStatSum(await world.contract.planets(ARTIFACT_PLANET_1.id));
    
        expect(statSumAfterActivation).to.not.be.within(statSumInitial - 5, statSumInitial + 5);
        expect(statSumAfterActivation).to.not.be.within(
          statSumAfterDeactivate - 5,
          statSumAfterDeactivate + 5
        );
        expect(statSumAfterDeactivate).to.be.within(statSumInitial - 5, statSumInitial + 5);
        expect(statSumAfterFound).to.be.within(statSumInitial - 5, statSumInitial + 5);
      });
  
  });