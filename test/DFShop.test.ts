import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  conquerUnownedPlanet,
  feedSilverToCap,
  fixtureLoader,
  increaseBlockchainTime,
  makeInitArgs,
} from './utils/TestUtils';
import { defaultWorldFixture, World } from './utils/TestWorld';
import {
  ARTIFACT_PLANET_1,
  LVL1_ASTEROID_2,
  SPAWN_PLANET_1,
} from './utils/WorldConstants';

const { BigNumber: BN } = ethers;

describe.only('DarkForestShop', function () {
  let world: World;

  beforeEach('load fixture', async function () {
    world = await fixtureLoader(defaultWorldFixture);
  });

  it('should load the world', async function () {
    const fromId = SPAWN_PLANET_1.id;

    await expect(world.user1Core.upgradePlanet(fromId, 0)).to.be.revertedWith(
      'Planet has not been initialized'
    );
  });

});
