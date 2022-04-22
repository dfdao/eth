import { ArtifactType } from '@darkforest_eth/types';
import { expect } from 'chai';
import {
  fixtureLoader, increaseBlockchainTime, increaseBlocks, makeInitArgs,
  makeMoveArgs,
  makeRevealArgs
} from './utils/TestUtils';
import {
  arenaWorldFixture, manualSpawnFixture, modifiedWorldFixture, spaceshipWorldFixture, targetPlanetFixture, World
} from './utils/TestWorld';
import {
  ADMIN_PLANET,
  ADMIN_PLANET_CLOAKED,
  LVL0_PLANET_DEEP_SPACE,
  LVL1_ASTEROID_1,
  LVL1_PLANET_SPACE,
  LVL2_PLANET_DEEP_SPACE,
  SPAWN_PLANET_1,
  SPAWN_PLANET_2,
  VALID_INIT_PERLIN
} from './utils/WorldConstants';

describe('Arena Functions', function () {
  describe('Create Planets', function () {
    let world: World;

    beforeEach('load fixture', async function () {
      world = await fixtureLoader(arenaWorldFixture);
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

    it('allows admin to create target planet', async function () {
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
        isTargetPlanet: true,
        isSpawnPlanet: false,
      });

      await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));

      const numTargetPlanets = await world.contract.getNTargetPlanets();
      expect(numTargetPlanets).to.equal(1);

      const targetPlanetId = await world.contract.targetPlanetIds(0);
      expect(targetPlanetId).to.equal(ADMIN_PLANET_CLOAKED.id);

      const targetPlanet = await world.contract.planetsArenaInfo(ADMIN_PLANET_CLOAKED.id);
      expect(targetPlanet.spawnPlanet).to.equal(false);
      expect(targetPlanet.targetPlanet).to.equal(true);
    });

    it('allows admin to bulk create planets', async function () {
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
          isTargetPlanet: false,
          isSpawnPlanet: false,
        },
        {
          location: ADMIN_PLANET_CLOAKED.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          isTargetPlanet: false,
          isSpawnPlanet: false,
        },
        {
          location: LVL1_PLANET_SPACE.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: true,
          isTargetPlanet: false,
          isSpawnPlanet: false,
        },
      ];
      await world.contract.bulkCreatePlanet(planets);

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

  describe('Manual Spawn', async function () {
    let world: World;
    this.beforeEach('load manual spawn', async function () {
      world = await fixtureLoader(manualSpawnFixture);
    });

    it('reverts if planet not initialized as a spawn planet', async function () {
      await expect(
        world.user1Core.initializePlayer(...makeInitArgs(ADMIN_PLANET_CLOAKED))
      ).to.be.revertedWith('Planet is not a spawn planet');
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

    it('gets false for a planet that is neither spawn nor target planet', async function () {
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
        isSpawnPlanet: false,
      });

      await world.contract.revealLocation(...makeRevealArgs(ADMIN_PLANET_CLOAKED, x, y));

      const numSpawnPlanets = await world.contract.getNSpawnPlanets();
      expect(numSpawnPlanets).to.equal(0);

      const spawnPlanet = await world.contract.planetsArenaInfo(ADMIN_PLANET_CLOAKED.id);

      expect(spawnPlanet.spawnPlanet).to.equal(false);
      expect(spawnPlanet.targetPlanet).to.equal(false);
    });

    it('sets the planet to the proper values', async function () {
      const perlin = 16;
      const level = 2;
      const planetType = 0; // planet
      const x = 10;
      const y = 20;
      await world.contract.createArenaPlanet({
        location: LVL2_PLANET_DEEP_SPACE.id,
        perlin,
        level,
        planetType,
        requireValidLocationId: false,
        isTargetPlanet: false,
        isSpawnPlanet: true,
      });

      await world.contract.revealLocation(...makeRevealArgs(LVL2_PLANET_DEEP_SPACE, x, y));

      const numSpawnPlanets = await world.contract.getNSpawnPlanets();
      expect(numSpawnPlanets).to.equal(1);

      await world.user1Core.initializePlayer(...makeInitArgs(LVL2_PLANET_DEEP_SPACE));

      const spawnPlanetInfo = await world.contract.planets(LVL2_PLANET_DEEP_SPACE.id);
      const spawnPlanetArenaInfo = await world.contract.planetsArenaInfo(LVL2_PLANET_DEEP_SPACE.id);

      expect(spawnPlanetArenaInfo.spawnPlanet).to.be.equal(true);
      expect(spawnPlanetInfo.isHomePlanet).to.be.equal(true);
      expect(spawnPlanetInfo.owner).to.be.equal(world.user1.address);
      expect(spawnPlanetInfo.population).to.be.equal(Number(spawnPlanetInfo.populationCap) / 4);
    });

    it('reverts if target planet is made', async function () {
      const perlin = VALID_INIT_PERLIN;
      const level = 0;
      const planetType = 0; // planet
      await expect(
        world.contract.createArenaPlanet({
          location: ADMIN_PLANET_CLOAKED.id,
          perlin,
          level,
          planetType,
          requireValidLocationId: false,
          isTargetPlanet: true,
          isSpawnPlanet: false,
        })
      ).to.be.revertedWith('admin cannot create target planets');
    });
  });

  describe('Invade and Claim Victory', function () {
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
      world = await fixtureLoader(worldFixture);
    });

    describe('invading target planet', function () {
      it('player cannot invade target planet without ownership', async function () {
        await expect(
          world.user1Core.invadeTargetPlanet(...makeRevealArgs(LVL0_PLANET_DEEP_SPACE, 10, 20))
        ).to.be.revertedWith('you can only invade planets you own');
      });

      describe('player owns target planet', async function () {
        beforeEach(async function () {
          const dist = 1;
          const shipsSent = 30000;
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
        const dist = 1;
        const shipsSent = 30000;
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
          await increaseBlocks();
        });
        it('cannot claim victory with a non-target planet', async function () {
          await expect(
            world.user1Core.claimTargetPlanetVictory(SPAWN_PLANET_1.id)
          ).to.be.revertedWith('you can only claim victory with a target planet');
        });
        it('must own planet to claim victory', async function () {
          await expect(
            world.user2Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id)
          ).to.be.revertedWith('you can only claim victory with planets you own');
        });
        it('gameover event emitted after claim victory', async function () {
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

  describe('Planet Constants Modifiers', function () {
    let defaultWorld: World;
    let nerfedWorld: World;
    let buffedWorld: World;
    beforeEach('load fixture', async function () {
      defaultWorld = await fixtureLoader(arenaWorldFixture);
      buffedWorld = await fixtureLoader(() => modifiedWorldFixture(200));
      nerfedWorld = await fixtureLoader(() => modifiedWorldFixture(50));
    });
    it('initializes planets with modifiers', async function () {

      const planet = {
        location: LVL1_ASTEROID_1.id,
        perlin: 20,
        level: 5,
        planetType : 1, //asteroid
        requireValidLocationId: false,
        isTargetPlanet: false,
        isSpawnPlanet: false,
      }
      await defaultWorld.contract.createArenaPlanet(planet);

      await buffedWorld.contract.createArenaPlanet(planet);

      await nerfedWorld.contract.createArenaPlanet(planet);

      const defaultPlanetData = await defaultWorld.contract.planets(LVL1_ASTEROID_1.id);
      const buffedPlanetData = await buffedWorld.contract.planets(LVL1_ASTEROID_1.id);
      const nerfedPlanetData = await nerfedWorld.contract.planets(LVL1_ASTEROID_1.id);

      expect(buffedPlanetData.populationCap.toNumber())
        .to.be.approximately(defaultPlanetData.populationCap.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.populationCap.toNumber() * 4, 5);

      expect(buffedPlanetData.populationGrowth.toNumber())
        .to.be.approximately(defaultPlanetData.populationGrowth.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.populationGrowth.toNumber() * 4, 5);

      expect(buffedPlanetData.silverCap.toNumber())
        .to.be.approximately(defaultPlanetData.silverCap.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.silverCap.toNumber() * 4, 5);

      expect(buffedPlanetData.silverGrowth.toNumber())
        .to.be.approximately(defaultPlanetData.silverGrowth.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.silverGrowth.toNumber() * 4, 5);

      expect(buffedPlanetData.defense.toNumber())
        .to.be.approximately(defaultPlanetData.defense.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.defense.toNumber() * 4, 5);

      expect(buffedPlanetData.range.toNumber())
        .to.be.approximately(defaultPlanetData.range.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.range.toNumber() * 4, 5);

      expect(buffedPlanetData.speed.toNumber())
        .to.be.approximately(defaultPlanetData.speed.toNumber() * 2, 5)
        .to.be.approximately(nerfedPlanetData.speed.toNumber() * 4, 5);
    });
  });

  describe('Spaceships', function () {
    let world: World;

    async function worldFixture() {
      const world = await fixtureLoader(() =>
        spaceshipWorldFixture([true, true, true, false, false])
      );
      let initArgs = makeInitArgs(SPAWN_PLANET_1);
      await world.user1Core.initializePlayer(...initArgs);
      await world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id);
      await increaseBlockchainTime();

      return world;
    }
    beforeEach('load fixture', async function () {
      world = await fixtureLoader(worldFixture);
    });

    it('gives you 3 space ships', async function () {
      expect((await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).length).to.be.equal(3);
    });

    it('gives you mothership', async function () {
      const mothership = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipMothership
      )?.artifact;
      expect(mothership).to.not.equal(undefined);
    });

    it('gives you whale', async function () {
      const whale = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipWhale
      )?.artifact;
      expect(whale).to.not.equal(undefined);
    });

    it('gives you crescent', async function () {
      const crescent = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipCrescent
      )?.artifact;
      expect(crescent).to.not.equal(undefined);
    });

    it('does not give you gear', async function () {
      const gear = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipGear
      )?.artifact;
      expect(gear).to.equal(undefined);
    });

    it('does not give you titan', async function () {
      const titan = (await world.user1Core.getArtifactsOnPlanet(SPAWN_PLANET_1.id)).find(
        (a) => a.artifact.artifactType === ArtifactType.ShipTitan
      )?.artifact;
      expect(titan).to.equal(undefined);
    });
  });
});
