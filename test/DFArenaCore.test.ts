import { ArtifactType } from '@darkforest_eth/types';
import { expect } from 'chai';
import {
  conquerUnownedPlanet,
  fixtureLoader,
  increaseBlockchainTime,
  makeInitArgs,
  makeMoveArgs,
  makeRevealArgs,
  getCurrentTime,
  getCurrentBlock,
  increaseBlockchainBlocks,
} from './utils/TestUtils';
import {
  arenaWorldFixture,
  manualSpawnFixture,
  targetPlanetFixture,
  World,
} from './utils/TestWorld';
import {
  ADMIN_PLANET,
  ADMIN_PLANET_CLOAKED,
  LVL0_PLANET_DEEP_SPACE,
  LVL1_PLANET_SPACE,
  LVL2_PLANET_DEEP_SPACE,
  SPAWN_PLANET_1,
  SPAWN_PLANET_2,
  VALID_INIT_PERLIN,
} from './utils/WorldConstants';

// describe('Initialize Arena', function() {
//     let world: World;

// })

describe.skip('Arena Functions', function () {
  describe('Claim Victory', function () {
    let world: World;

    async function worldFixture() {
      world = await fixtureLoader(targetPlanetFixture);
      let initArgs = makeInitArgs(SPAWN_PLANET_1);
      await world.user1Core.initializePlayer(...initArgs);
      // await increaseBlockchainTime();

      initArgs = makeInitArgs(SPAWN_PLANET_2);
      await world.user2Core.initializePlayer(...initArgs);

      const perlin = 20;
      const level = 0;
      const planetType = 1; // asteroid field
      await world.contract.createArenaPlanet({
        location: LVL0_PLANET_DEEP_SPACE.id,
        perlin,
        level,
        planetType,
        requireValidLocationId: true,
        isTargetPlanet: true,
        isSpawnPlanet: false,
      });
      // await increaseBlockchainTime();

      return world;
    }

    beforeEach(async function () {
      console.log(`loading world`);
      world = await fixtureLoader(worldFixture);
    });

    describe('invading target planet', function () {
      beforeEach(async function () {
        world = await fixtureLoader(worldFixture);
      });

      it('player cannot invade target planet without ownership', async function () {
        await expect(
          world.user1Core.invadeTargetPlanet(...makeRevealArgs(LVL0_PLANET_DEEP_SPACE, 10, 20))
        ).to.be.revertedWith('you can only invade planets you own');
      });
      describe('player owns target planet', async function () {
        beforeEach(async function () {
          const dist = 1;
          const shipsSent = 50000;
          const silverSent = 0;
          await world.user1Core.move(
            ...makeMoveArgs(SPAWN_PLANET_1, LVL0_PLANET_DEEP_SPACE, dist, shipsSent, silverSent)
          );
        });
        it('player can invade target planet', async function () {
          await expect(
            world.user1Core.invadeTargetPlanet(...makeRevealArgs(LVL0_PLANET_DEEP_SPACE, 10, 20))
          )
            .to.emit(world.contract, 'TargetPlanetInvaded')
            .withArgs(world.user1.address, LVL0_PLANET_DEEP_SPACE.id);
        });
      });
    });

    describe('claiming victory on target planet', function () {
      beforeEach(async function () {
        world = await fixtureLoader(worldFixture);

        const dist = 1;
        const shipsSent = 50000;
        const silverSent = 0;
        await world.user1Core.move(
          ...makeMoveArgs(SPAWN_PLANET_1, LVL0_PLANET_DEEP_SPACE, dist, shipsSent, silverSent)
        );
        await world.user1Core.invadeTargetPlanet(...makeRevealArgs(LVL0_PLANET_DEEP_SPACE, 10, 20));
      });
      it('needs to hold planet for enough time', async function () {
        await expect(
          world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id)
        ).to.be.revertedWith('you have not held the planet long enough to claim victory with it');
      });
      describe('time elapsed', async function () {
        beforeEach(async function () {
          await increaseBlockchainBlocks();
        });
        it('cant claim victory with a non-target planet', async function () {
          await expect(
            world.user1Core.claimTargetPlanetVictory(SPAWN_PLANET_1.id)
          ).to.be.revertedWith('you can only claim victory with a target planet');
        });
        it('must own planet to claim victory', async function () {
          await expect(
            world.user2Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id)
          ).to.be.revertedWith('you can only claim victory with planets you own');
        });
        it('should emit event', async function () {
          const planet = await world.contract.planetsExtendedInfo2(LVL0_PLANET_DEEP_SPACE.id);
          await expect(world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id))
            .to.emit(world.contract, 'Gameover')
            .withArgs(LVL0_PLANET_DEEP_SPACE.id);
        });
        it('sets gameover to true and winner to msg sender', async function () {
          await world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id);
          const winners = await world.contract.getWinners();
          const gameover = await world.contract.getGameover();
          expect(winners.length).to.equal(1);
          expect(winners[0]).to.equal(world.user1.address);
          expect(gameover).to.equal(true);
        });
      });
    });
  });

  describe('DarkForestTarget', function () {
    let world: World;

    beforeEach('load fixture', async function () {
      world = await fixtureLoader(targetPlanetFixture);
    });

    it('allows admin to create target planet', async function () {
      world = await fixtureLoader(targetPlanetFixture);

      const perlin = 20;
      const level = 5;
      const planetType = 1; // asteroid field
      const x = 10;
      const y = 20;
      await world.contract.createPlanet({
        location: ADMIN_PLANET_CLOAKED.id,
        perlin,
        level,
        planetType,
        requireValidLocationId: false,
        // isTargetPlanet: true,
        // isSpawnPlanet: false
      });

      await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));

      const numTargetPlanets = await world.contract.getNTargetPlanets();
      expect(numTargetPlanets).to.equal(1);

      const targetPlanetId = await world.contract.targetPlanetIds(0);
      expect(targetPlanetId).to.equal(ADMIN_PLANET_CLOAKED.id);

      const targetPlanet = await world.contract.planetsArenaInfo(ADMIN_PLANET_CLOAKED.id);
      console.log(`targetPlanet: ${targetPlanet}`);
      expect(targetPlanet.spawnPlanet).to.equal(false);
      expect(targetPlanet.targetPlanet).to.equal(true);
    });
  });

  describe('DarkForestSpawn', function () {
    let world: World;

    beforeEach('load fixture', async function () {
      world = await fixtureLoader(manualSpawnFixture);
    });

    it('allows admin to create a spawn planet', async function () {
      const perlin = 20;
      const level = 5;
      const planetType = 1; // asteroid field
      const x = 10;
      const y = 20;
      await world.contract.createArenaPlanet({
        location: ADMIN_PLANET_CLOAKED.id,
        perlin,
        level,
        planetType,
        requireValidLocationId: false,
        isTargetPlanet: false,
        isSpawnPlanet: true,
      });

      await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));

      const numSpawnPlanets = await world.contract.getNSpawnPlanets();
      expect(numSpawnPlanets).to.equal(1);

      const spawnPlanet = await world.contract.spawnPlanetIds(0);

      expect(spawnPlanet).to.equal(ADMIN_PLANET_CLOAKED.id);
    });

    it('allows player to spawn at admin planet that is initialized', async function () {
      const perlin = VALID_INIT_PERLIN;
      const level = 0;
      const planetType = 0; // planet
      await world.contract.createArenaPlanet({
        location: ADMIN_PLANET_CLOAKED.id,
        perlin,
        level,
        planetType,
        requireValidLocationId: false,
        isTargetPlanet: false,
        isSpawnPlanet: true,
      });

      const toPlanetExtended = await world.contract.planetsExtendedInfo(ADMIN_PLANET_CLOAKED.id);
      expect(toPlanetExtended.isInitialized).to.equal(true);

      await expect(world.user1Core.initializePlayer(...makeInitArgs(ADMIN_PLANET_CLOAKED)))
        .to.emit(world.contract, 'PlayerInitialized')
        .withArgs(world.user1.address, ADMIN_PLANET_CLOAKED.id.toString());
    });

    it('reverts if no spawn planets', async function () {
      await expect(
        world.user1Core.initializePlayer(...makeInitArgs(ADMIN_PLANET_CLOAKED))
      ).to.be.revertedWith('Planet is not a spawn planet');
    });

    describe('manual spawn', async function () {
      this.beforeEach('load manual spawn', async function () {
        world = await fixtureLoader(manualSpawnFixture);
        expect((await world.contract.getArenaConstants()).MANUAL_SPAWN);
      });

      it('reverts if spawn planet already initialized', async function () {
        const perlin = VALID_INIT_PERLIN;
        const level = 0;
        const planetType = 0; // planet
        await world.contract.createArenaPlanet({
          location: ADMIN_PLANET_CLOAKED.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          isTargetPlanet: false,
          isSpawnPlanet: true,
        });

        const toPlanetExtended = await world.contract.planetsExtendedInfo(ADMIN_PLANET_CLOAKED.id);
        expect(toPlanetExtended.isInitialized).to.equal(true);

        await expect(world.user1Core.initializePlayer(...makeInitArgs(ADMIN_PLANET_CLOAKED)))
          .to.emit(world.contract, 'PlayerInitialized')
          .withArgs(world.user1.address, ADMIN_PLANET_CLOAKED.id.toString());

        await expect(
          world.user2Core.initializePlayer(...makeInitArgs(ADMIN_PLANET_CLOAKED))
        ).to.be.revertedWith('Planet is owned');
      });

      it('gets false for a planet that is neither spawn nor target planet', async function () {
        const perlin = 20;
        const level = 5;
        const planetType = 1; // asteroid field
        const x = 10;
        const y = 20;
        await world.contract.createPlanet({
          location: ADMIN_PLANET_CLOAKED.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          // isTargetPlanet: false,
          // isSpawnPlanet: false
        });

        await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));

        const numSpawnPlanets = await world.contract.getNSpawnPlanets();
        expect(numSpawnPlanets).to.equal(0);

        const spawnPlanet = await world.contract.planetsArenaInfo(ADMIN_PLANET_CLOAKED.id);
        console.log(`spawnPlanet: ${spawnPlanet}`);

        expect(spawnPlanet.spawnPlanet).to.equal(false);
        expect(spawnPlanet.targetPlanet).to.equal(false);
      });
      it('sets the planet to the proper values', async function () {
        const perlin = 16;
        const level = 2;
        const planetType = 0; // planet
        const x = 10;
        const y = 20;
        await world.contract.createPlanet({
          location: LVL2_PLANET_DEEP_SPACE.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          // isTargetPlanet: false,
          // isSpawnPlanet: true
        });

        await world.contract.revealLocation(...makeRevealArgs(LVL2_PLANET_DEEP_SPACE, x, y));

        const numSpawnPlanets = await world.contract.getNSpawnPlanets();
        expect(numSpawnPlanets).to.equal(1);

        await world.user1Core.initializePlayer(...makeInitArgs(LVL2_PLANET_DEEP_SPACE));

        const spawnPlanetInfo = await world.contract.planets(LVL2_PLANET_DEEP_SPACE.id);
        const spawnPlanetArenaInfo = await world.contract.planetsArenaInfo(
          LVL2_PLANET_DEEP_SPACE.id
        );

        expect(spawnPlanetArenaInfo.spawnPlanet).to.be.equal(true);
        expect(spawnPlanetInfo.isHomePlanet).to.be.equal(true);
        expect(spawnPlanetInfo.owner).to.be.equal(world.user1.address);
        console.log(`cap: ${spawnPlanetInfo.populationCap}, pop: ${spawnPlanetInfo.population}`);
        expect(spawnPlanetInfo.population).to.be.equal(Number(spawnPlanetInfo.populationCap) / 4);
      });
    });

    it.skip('allows admin to bulk create planets', async function () {
      const perlin = 20;
      const level = 5;
      const planetType = 1; // asteroid field
      const x = 10;
      const y = 20;
      const planets = [
        {
          location: ADMIN_PLANET.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: true,
          // isTargetPlanet: false,
          // isSpawnPlanet: false
        },
        {
          location: ADMIN_PLANET_CLOAKED.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          // isTargetPlanet: false,
          // isSpawnPlanet: false
        },
        {
          location: LVL1_PLANET_SPACE.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: true,
          // isTargetPlanet: false,
          // isSpawnPlanet: false
        },
      ];
      // await world.contract.bulkCreatePlanet(planets);

      await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET, x, y));
      await world.contract.revealLocation(...makeRevealArgs(LVL1_PLANET_SPACE, 50, 100));

      const revealedCoords = await world.contract.revealedCoords(ADMIN_PLANET.id);
      expect(revealedCoords.x.toNumber()).to.equal(x);
      expect(revealedCoords.y.toNumber()).to.equal(y);

      const revealedCoords1 = await world.contract.revealedCoords(LVL1_PLANET_SPACE.id);
      expect(revealedCoords1.x.toNumber()).to.equal(50);
      expect(revealedCoords1.y.toNumber()).to.equal(100);

      expect((await world.contract.getNRevealedPlanets()).toNumber()).to.equal(2);
      expect(await world.contract.revealedPlanetIds(0)).to.be.equal(ADMIN_PLANET.id);
      expect(await world.contract.revealedPlanetIds(1)).to.be.equal(LVL1_PLANET_SPACE.id);
    });
  });
});
