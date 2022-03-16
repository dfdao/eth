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
import { defaultWorldFixture, targetPlanetFixture, World } from './utils/TestWorld';
import { LVL0_PLANET_DEEP_SPACE, SPAWN_PLANET_1, SPAWN_PLANET_2 } from './utils/WorldConstants';

describe('Claim Victory', function () {
  let world: World;

  async function worldFixture() {
    world = await fixtureLoader(targetPlanetFixture);
    let initArgs = makeInitArgs(SPAWN_PLANET_1);
    await world.user1Core.initializePlayer(...initArgs);
    await world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id);
    // await increaseBlockchainTime();

    initArgs = makeInitArgs(SPAWN_PLANET_2);
    await world.user2Core.initializePlayer(...initArgs);

    const perlin = 20;
    const level = 0;
    const planetType = 1; // asteroid field
    await world.contract.createPlanet({
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
    console.log(`loading world`)
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
        await expect(world.user1Core.invadeTargetPlanet(...makeRevealArgs(LVL0_PLANET_DEEP_SPACE, 10, 20)))
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
      await expect(world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id)).to.be.revertedWith(
        'you have not held the planet long enough to claim victory with it'
      );
    });
    describe('time elapsed', async function () {
      beforeEach(async function () {
        await increaseBlockchainBlocks();
      });
      it('cant claim victory with a non-target planet', async function () {
        await expect(world.user1Core.claimTargetPlanetVictory(SPAWN_PLANET_1.id)).to.be.revertedWith(
          'you can only claim victory with a target planet'
        );
      });
      it('must own planet to claim victory', async function () {
        await expect(world.user2Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id)).to.be.revertedWith(
          'you can only claim victory with planets you own'
        );
      });
      it('should emit event', async function () {
       
        const planet = await world.contract.planetsExtendedInfo2(LVL0_PLANET_DEEP_SPACE.id);
        await expect(world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id))
          .to.emit(world.contract, 'Gameover')
          .withArgs(world.user1.address);
      });
      it('sets gameover to true and winner to msg sender', async function () {
        await world.user1Core.claimTargetPlanetVictory(LVL0_PLANET_DEEP_SPACE.id);
        const winners = await world.contract.getWinners();
        const gameover = await world.contract.getGameover();
        expect(winners[0]).to.equal(world.user1.address);
        expect(gameover).to.equal(true);
      });
    });
  });
});
