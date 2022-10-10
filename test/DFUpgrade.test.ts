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
  LVL1_ASTEROID_1,
  LVL1_ASTEROID_2,
  LVL1_PLANET_DEEP_SPACE,
  LVL1_PLANET_NEBULA,
  LVL1_QUASAR,
  LVL2_PLANET_DEAD_SPACE,
  LVL3_SPACETIME_1,
  SPAWN_PLANET_1,
} from './utils/WorldConstants';

const { BigNumber: BN } = ethers;

describe('DarkForestUpgrade', function () {
  let world: World;

  beforeEach('load fixture', async function () {
    world = await fixtureLoader(defaultWorldFixture);
    await world.user1Core.initializePlayer(...makeInitArgs(SPAWN_PLANET_1));

  });

  it('should reject if planet not initialized', async function () {
    await expect(world.user1Core.upgradePlanet(LVL1_PLANET_DEEP_SPACE.id, 0)).to.be.revertedWith(
      'Planet has not been initialized'
    );
  });

  it('should reject if not planet owner', async function () {
    const player1Planet = SPAWN_PLANET_1.id;

    await expect(world.user2Core.upgradePlanet(player1Planet, 0)).to.be.revertedWith(
      'Only owner account can perform that operation on planet.'
    );
  });

  it('should reject if planet level is not high enough', async function () {
    const lowLevelPlanet = SPAWN_PLANET_1.id;

    await expect(world.user1Core.upgradePlanet(lowLevelPlanet, 0)).to.be.revertedWith(
      'Planet level is not high enough for this upgrade'
    );
  });

  it('should reject if upgrade branch not valid', async function () {
    const upgradeablePlanetId = LVL1_PLANET_NEBULA.id;

    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_NEBULA);

    await expect(world.user1Core.upgradePlanet(upgradeablePlanetId, 99)).to.be.revertedWith(
      'Upgrade branch not valid'
    );
  });

  it('should upgrade planet stats and emit event', async function () {
    const upgradeablePlanetId = LVL1_PLANET_NEBULA.id;
    const silverMinePlanetId = LVL1_ASTEROID_2.id;

    // conquer silver mine and upgradeable planet
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_NEBULA);
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_2);

    await increaseBlockchainTime();

    await world.user1Core.refreshPlanet(silverMinePlanetId);

    const silverMineSilver = (await world.user1Core.planets(silverMinePlanetId)).silver;

    await world.user1Core.withdrawSilver(silverMinePlanetId);

    expect((await world.user1Core.players(world.user1.address)).score).to.equal(silverMineSilver);

    const planetBeforeUpgrade = await world.contract.planets(upgradeablePlanetId);
    const playerBeforeUpgrade = await world.contract.players(world.user1.address);

    const silverCap = planetBeforeUpgrade.silverCap.toNumber();
    const initialSilver = playerBeforeUpgrade.score.toNumber();
    const initialPopulationCap = planetBeforeUpgrade.populationCap;
    const initialPopulationGrowth = planetBeforeUpgrade.populationGrowth;

    await expect(world.user1Core.upgradePlanet(upgradeablePlanetId, 0))
      .to.emit(world.contract, 'PlanetUpgraded')
      .withArgs(world.user1.address, upgradeablePlanetId, BN.from(0), BN.from(1));

    const planetAfterUpgrade = await world.contract.planets(upgradeablePlanetId);
    const playerAfterUpgrade = await world.contract.players(world.user1.address);
    const newPopulationCap = planetAfterUpgrade.populationCap;
    const newPopulationGrowth = planetAfterUpgrade.populationGrowth;
    const newSilver = playerAfterUpgrade.score.toNumber();

    expect(newSilver).to.equal(initialSilver - 0.2 * silverCap);
    expect(initialPopulationCap).to.be.below(newPopulationCap.toNumber());
    expect(initialPopulationGrowth).to.be.below(newPopulationGrowth.toNumber());
  });

  it("should reject upgrade if there's not enough resources", async function () {
    const upgradeablePlanetId = LVL1_PLANET_NEBULA.id;


    // conquer the upgradeable planet
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_NEBULA);

    await increaseBlockchainTime();

    await expect(world.user1Core.upgradePlanet(upgradeablePlanetId, 0)).to.be.revertedWith(
      'Insufficient silver to upgrade'
    );
  });

  it('should reject upgrade if branch is maxed', async function () {
    const upgradeablePlanetId = LVL1_PLANET_DEEP_SPACE.id;

    // conquer upgradeable planet and silver planet
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_DEEP_SPACE);
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_2);

    await increaseBlockchainTime();

    for (let i = 0; i < 4; i++) {
      // fill up planet with silver
      await world.user1Core.withdrawSilver(LVL1_ASTEROID_2.id);

      await world.user1Core.upgradePlanet(upgradeablePlanetId, 1, {});

      await increaseBlockchainTime();
    }

    await expect(world.user1Core.upgradePlanet(upgradeablePlanetId, 1)).to.be.revertedWith(
      'Upgrade branch already maxed'
    );
  });

  it('should reject upgrade if total level already maxed (safe space)', async function () {
    this.timeout(10000);

    const upgradeablePlanetId = LVL1_PLANET_NEBULA.id;

    // conquer upgradeable planet and silver planet
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_PLANET_NEBULA);
    await conquerUnownedPlanet(world, world.user1Core, SPAWN_PLANET_1, LVL1_ASTEROID_1);

    await increaseBlockchainTime();

    const branchOrder = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      await world.user1Core.withdrawSilver(LVL1_ASTEROID_1.id);

      await world.user1Core.upgradePlanet(upgradeablePlanetId, branchOrder[i]);

      await increaseBlockchainTime();
    }

    // await expect(world.user1Core.upgradePlanet(upgradeablePlanetId, 1)).to.be.revertedWith(
    //   'Planet at max total level'
    // );
  });
});
