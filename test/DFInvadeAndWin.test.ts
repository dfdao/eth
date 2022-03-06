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
} from './utils/TestUtils';
import { defaultWorldFixture, World } from './utils/TestWorld';
import { ADMIN_PLANET, SPAWN_PLANET_1, SPAWN_PLANET_2 } from './utils/WorldConstants';

describe('Claim Victory', function () {
  let world: World;

  async function worldFixture() {
    const world = await fixtureLoader(defaultWorldFixture);
    let initArgs = makeInitArgs(SPAWN_PLANET_1);
    await world.user1Core.initializePlayer(...initArgs);
    await world.user1Core.giveSpaceShips(SPAWN_PLANET_1.id);
    await increaseBlockchainTime();

    initArgs = makeInitArgs(SPAWN_PLANET_2);
    await world.user2Core.initializePlayer(...initArgs);

    const perlin = 20;
    const level = 0;
    const planetType = 1; // asteroid field
    await world.contract.createPlanet({
      location: ADMIN_PLANET.id,
      perlin,
      level,
      planetType,
      requireValidLocationId: true,
      isTargetPlanet: true,
      isSpawnPlanet: false,
    });
    await increaseBlockchainTime();

    return world;
  }

  beforeEach(async function () {
    world = await fixtureLoader(worldFixture);
  });
  describe('invading target planet', function () {
    it('player cannot invade target planet without ownership', async function () {
      await expect(
        world.user1Core.invadePlanet(...makeRevealArgs(ADMIN_PLANET, 10, 20))
      ).to.be.revertedWith('you can only invade planets you own');
    });
    describe('player owns target planet', async function () {
      beforeEach(async function () {
        const dist = 1;
        const shipsSent = 50000;
        const silverSent = 0;
        await world.user1Core.move(
          ...makeMoveArgs(SPAWN_PLANET_1, ADMIN_PLANET, dist, shipsSent, silverSent)
        );
      });
      it('player can invade target planet', async function () {
        await expect(world.user1Core.invadePlanet(...makeRevealArgs(ADMIN_PLANET, 10, 20)))
          .to.emit(world.contract, 'PlanetInvaded')
          .withArgs(world.user1.address, ADMIN_PLANET.id);
      });
    });
  });

  describe('claiming victory on target planet', function () {
    beforeEach(async function () {
      const dist = 1;
      const shipsSent = 50000;
      const silverSent = 0;
      await world.user1Core.move(
        ...makeMoveArgs(SPAWN_PLANET_1, ADMIN_PLANET, dist, shipsSent, silverSent)
      );
      await world.user1Core.invadePlanet(...makeRevealArgs(ADMIN_PLANET, 10, 20));
    });
    it('needs to hold planet for enough time', async function () {
      await expect(world.user1Core.claimVictory(ADMIN_PLANET.id)).to.be.revertedWith(
        'you have not held the planet long enough to claim victory with it'
      );
    });
    describe('time elapsed', async function () {
      beforeEach(async function () {
        await increaseBlockchainTime(1000);
      });
      it('cant claim victory with a non-target planet', async function () {
        await expect(world.user1Core.claimVictory(SPAWN_PLANET_1.id)).to.be.revertedWith(
          'you can only claim victory with a target planet'
        );
      });
      it('must own planet to claim victory', async function () {
        await expect(world.user2Core.claimVictory(ADMIN_PLANET.id)).to.be.revertedWith(
          'you can only claim victory with planets you own'
        );
      });
      it('should emit event', async function () {
       
        const planet = await world.contract.planetsExtendedInfo2(ADMIN_PLANET.id);
        await expect(world.user1Core.claimVictory(ADMIN_PLANET.id))
          .to.emit(world.contract, 'Gameover')
          .withArgs(world.user1.address);
      });
      it('sets gameover to true and winner to msg sender', async function () {
        await world.user1Core.claimVictory(ADMIN_PLANET.id);
        const winner = await world.contract.getWinner();
        const gameover = await world.contract.getGameover();
        expect(winner).to.equal(world.user1.address);
        expect(gameover).to.equal(true);
      });
    });
  });
});
