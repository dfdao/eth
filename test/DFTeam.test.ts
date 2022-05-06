import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import { expect } from 'chai';
import {
    conquerUnownedPlanet,
    fixtureLoader,
    increaseBlockchainTime,
    makeInitArgs,
    makeMoveArgs
} from './utils/TestUtils';
import { arenaWorldFixture, World } from './utils/TestWorld';
import { LVL3_UNOWNED_DEEP_SPACE, SPAWN_PLANET_1, SPAWN_PLANET_2 } from './utils/WorldConstants';

describe('Teams', function () {
  describe('joining a team', async function () {
    let world: World;

    async function worldFixture() {
      const world = await fixtureLoader(arenaWorldFixture);
      let initArgs = makeInitArgs(SPAWN_PLANET_1);
      await world.user1Core.initializePlayer(...initArgs);

      return world;
    }

    beforeEach(async function () {
      world = await fixtureLoader(worldFixture);
    });

    it('allows players to join a valid team', async function () {
      await world.user1Core.joinTeam(1);
      const player = await world.contract.arenaPlayers(world.user1.address);
      expect(player.team).to.eq(1);
    });

    it('does not allow players to join an invalid team', async function () {
      await expect(world.user1Core.joinTeam(694201337)).to.be.revertedWith('invalid team');
    });

    it('does not allow players to change teams', async function () {
      await world.user1Core.joinTeam(1);
      await expect(world.user1Core.joinTeam(0)).to.be.revertedWith('player is already on a team');
    });
  });

  describe('sending a move to a team member planet', async function () {
    let world: World;

    async function worldFixture() {
      const world = await fixtureLoader(arenaWorldFixture);
      let initArgs = makeInitArgs(SPAWN_PLANET_1);
      await world.user1Core.initializePlayer(...initArgs);
      await world.user1Core.joinTeam(1);
      initArgs = makeInitArgs(SPAWN_PLANET_2);
      await world.user2Core.initializePlayer(...initArgs);
      await world.user2Core.joinTeam(1);
      await increaseBlockchainTime();

      return world;
    }

    beforeEach(async function () {
      world = await fixtureLoader(worldFixture);
    });

    it('adds energy to the planet', async function () {
      await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL3_UNOWNED_DEEP_SPACE);
      await increaseBlockchainTime();

      // Normally this move would conquer the planet
      await world.user1Core.move(
        ...makeMoveArgs(LVL3_UNOWNED_DEEP_SPACE, SPAWN_PLANET_2, 100, 1_000_000, 0)
      );
      await increaseBlockchainTime();
      await world.contract.refreshPlanet(SPAWN_PLANET_2.id);

      const planetData = await world.contract.planets(SPAWN_PLANET_2.id);
      expect(planetData.owner).to.eq(world.user2.address);
    });
  });
});