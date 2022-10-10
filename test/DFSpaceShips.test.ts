import { ArtifactType } from '@darkforest_eth/types';
import { expect } from 'chai';
import {
  conquerUnownedPlanet,
  createArtifactOnPlanet,
  fixtureLoader,
  increaseBlockchainTime,
  makeInitArgs,
  makeMoveArgs,
} from './utils/TestUtils';
import { defaultWorldFixture, World } from './utils/TestWorld';
import {
  LVL0_PLANET,
  LVL1_ASTEROID_1,
  LVL1_PLANET_DEEP_SPACE,
  LVL2_PLANET_SPACE,
  SPAWN_PLANET_1,
  SPAWN_PLANET_2,
} from './utils/WorldConstants';

describe('Space Ships', function () {
  let world: World;

  async function worldFixture() {
    const world = await fixtureLoader(defaultWorldFixture);
    let initArgs = makeInitArgs(SPAWN_PLANET_1);
    await world.user1Core.initializePlayer(...initArgs);
    await world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id);
    await increaseBlockchainTime();

    initArgs = makeInitArgs(SPAWN_PLANET_2);
    await world.user2Core.initializePlayer(...initArgs);
    await increaseBlockchainTime();

    return world;
  }

  beforeEach(async function () {
    world = await fixtureLoader(worldFixture);
  });

  describe('spawning your ships', function () {
    it('gives you 5 space ships', async function () {
      expect((await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).length).to.be.equal(5);
    });

    it('can only be done once per player', async function () {
      await expect(world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id)).to.be.revertedWith(
        'player already claimed ships'
      );
    });

    describe('spawning on planet you do not own', async function () {
      it('reverts', async function () {
        await expect(world.user2Core.giveSpaceShips(LVL2_PLANET_SPACE.id)).to.be.revertedWith(
          'you can only spawn ships on your home planet'
        );
      });
    });
  });

  describe('using the Titan', async function () {
    it('pauses energy regeneration on planets', async function () {
      const titan = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipTitan
      )?.artifact;

      // Move Titan to planet
      await world.user1Core.move(
        ...makeMoveArgs(SPAWN_PLANET_1, LVL1_ASTEROID_1, 1000, 0, 0, titan?.id)
      );
      await increaseBlockchainTime();

      await world.contract.refreshPlanet(SPAWN_PLANET_1.id);
      const spawn = await world.contract.planets(SPAWN_PLANET_1.id);

      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_1);

      const previousPlanet = await world.contract.planets(LVL1_ASTEROID_1.id);
      const sendingPopulation = 50000;

      // Move energy off of planet and wait
      await world.user1Core.move(
        ...makeMoveArgs(LVL1_ASTEROID_1, SPAWN_PLANET_1, 100, sendingPopulation, 0)
      );
      await increaseBlockchainTime();

      const currentPlanetPopulation = (await world.contract.planets(LVL1_ASTEROID_1.id)).population;
      const expectedPopulation = previousPlanet.population.sub(sendingPopulation);
      // Population did not grow
      await world.contract.refreshPlanet(LVL1_ASTEROID_1.id);
      expect(currentPlanetPopulation).to.be.equal(expectedPopulation);

      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_DEEP_SPACE);
      await increaseBlockchainTime();

      // DUMP energy onto the Titan-ed planet
      for (let i = 0; i < 30; i++) {
        await world.user1Core.move(
          ...makeMoveArgs(LVL1_PLANET_DEEP_SPACE, LVL1_ASTEROID_1, 100, 60_000, 0)
        );
        await increaseBlockchainTime();
      }

      // It should not overflow
      await world.contract.refreshPlanet(LVL1_ASTEROID_1.id);
      const currentPlanet = await world.contract.planets(LVL1_ASTEROID_1.id);
      expect(currentPlanet.population).to.be.equal(currentPlanet.populationCap);
    });
  });

  describe('using the Antimatter Cube', async function () {
    it('pauses energy regeneration on planets', async function () {
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_1);
      await increaseBlockchainTime();

      // // put cube on planet;
      const artifactId = await createArtifactOnPlanet(
        world.contract,
        world.user1.address,
        LVL1_ASTEROID_1,
        ArtifactType.AntimatterCube
      );
      const cube = (await world.user1Core.getArtifactsOnPlanet(LVL1_ASTEROID_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.AntimatterCube
      )?.artifact;

      const previousPlanet = await world.contract.planets(LVL1_ASTEROID_1.id);
      const sendingPopulation = 50000;

      // Move energy off of planet and wait
      await world.user1Core.move(
        ...makeMoveArgs(LVL1_ASTEROID_1, SPAWN_PLANET_1, 100, sendingPopulation, 0)
      );

      await increaseBlockchainTime();

      const currentPlanetPopulation = (await world.contract.planets(LVL1_ASTEROID_1.id)).population;
      const expectedPopulation = previousPlanet.population.sub(sendingPopulation);
      // Population did not grow
      await world.contract.refreshPlanet(LVL1_ASTEROID_1.id);
      expect(currentPlanetPopulation).to.be.equal(expectedPopulation);
    });
    it('halves range on move', async function () {
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_1);
      await increaseBlockchainTime();

      const previousPlanet = await world.contract.planets(LVL1_ASTEROID_1.id);
      const sendingPopulation = 50000;

      // Move energy off of planet and wait
      const moveTx = await world.user1Core.move(
        ...makeMoveArgs(LVL1_ASTEROID_1, LVL0_PLANET, 100, sendingPopulation, 0)
      );
      const moveReceipt = await moveTx.wait();
      const voyageId = moveReceipt.events?.[0].args?.[1];
      const voyage = await world.contract.getPlanetArrival(voyageId);

      await increaseBlockchainTime();
      await world.contract.refreshPlanet(LVL1_ASTEROID_1.id);
      // // put cube on planet;
      const artifactId = await createArtifactOnPlanet(
        world.contract,
        world.user1.address,
        LVL1_ASTEROID_1,
        ArtifactType.AntimatterCube
      );

      const cube = (await world.user1Core.getArtifactsOnPlanet(LVL1_ASTEROID_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.AntimatterCube
      )?.artifact;

      // Move the cube.
      const move = await world.user1Core.move(
        ...makeMoveArgs(LVL1_ASTEROID_1, LVL0_PLANET, 100, sendingPopulation, 0, cube?.id)
      );
      const moveRct = await move.wait();
      const voyageId1 = moveRct.events?.[0].args?.[1];
      const voyage1 = await world.contract.getPlanetArrival(voyageId1);
      expect(voyage.popArriving.toNumber()).to.be.greaterThan(voyage1.popArriving.toNumber());
    });
  });

  describe('spawning on non-home planet', async function () {
    let world: World;

    async function worldFixture() {
      const world = await fixtureLoader(defaultWorldFixture);
      const initArgs = makeInitArgs(SPAWN_PLANET_2);
      await world.user2Core.initializePlayer(...initArgs);

      await conquerUnownedPlanet(world, world.user2Core, SPAWN_PLANET_2, LVL2_PLANET_SPACE);

      return world;
    }

    beforeEach(async function () {
      world = await fixtureLoader(worldFixture);
    });

    it('reverts', async function () {
      await expect(world.user2Core.giveSpaceShips(LVL2_PLANET_SPACE.id)).to.be.revertedWith(
        'you can only spawn ships on your home planet'
      );
    });
  });
});
