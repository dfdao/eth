import type { DarkForest } from '@darkforest_eth/contracts/typechain';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployAndCutArena } from '../../tasks/arena-deploy';
import { deployAndCut } from '../../tasks/deploy';
import {
  arenaWorldInitializers,
  initializers,
  initPlanetsInitializers,
  manualSpawnInitializers,
  noAdminInitializers,
  noPlanetTransferInitializers,
  planetLevelThresholdInitializer,
  target4Initializers,
  targetPlanetInitializers
} from './WorldConstants';


export interface World {
  contract: DarkForest;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  deployer: SignerWithAddress;
  user1Core: DarkForest;
  user2Core: DarkForest;
}

export interface Player {
  isInitialized: boolean;
  player: string;
  initTimestamp: BigNumber;
  homePlanetId: BigNumber;
  lastRevealTimestamp: BigNumber;
  score: BigNumber;
}

export interface InitializeWorldArgs {
  initializers: HardhatRuntimeEnvironment['initializers'];
  whitelistEnabled: boolean;
  arena?: boolean;
}

export function defaultWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers,
    whitelistEnabled: false,
  });
}


export function growingWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers: target4Initializers,
    whitelistEnabled: false,
  });
}

export function whilelistWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers,
    whitelistEnabled: true,
  });
}

export function noPlanetTransferFixture(): Promise<World> {
  return initializeWorld({
    initializers: noPlanetTransferInitializers,
    whitelistEnabled: false,
  });
}

export function planetLevelThresholdFixture(): Promise<World> {
  return initializeWorld({
    initializers: planetLevelThresholdInitializer,
    whitelistEnabled: false,
    arena: false,
  });
}

/*
Identical to defaultWorldFixture but with arena facets cut in
*/
export function arenaWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers: arenaWorldInitializers,
    whitelistEnabled: false,
    arena: true,
  });
}

export function noAdminWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers: noAdminInitializers,
    whitelistEnabled: false,
    arena: true,
  });
}

export function initPlanetsArenaFixture(): Promise<World> {
  return initializeWorld({
    initializers: initPlanetsInitializers,
    whitelistEnabled: false,
    arena: true,
  });
}

export function manualSpawnFixture(): Promise<World> {
  return initializeWorld({
    initializers: manualSpawnInitializers,
    whitelistEnabled: false,
    arena: true
  });
}

export function targetPlanetFixture(): Promise<World> {
  return initializeWorld({
    initializers: targetPlanetInitializers,
    whitelistEnabled: false,
    arena: true
  });
}

export function modifiedWorldFixture(mod: number): Promise<World> {
  return initializeWorld({
    initializers: { ...initializers, MODIFIERS: [mod, mod, mod, mod, mod, mod, mod, mod] },
    whitelistEnabled: false,
    arena: true
  });
}

export function spaceshipWorldFixture(spaceships: [boolean, boolean, boolean, boolean, boolean]): Promise<World> {
  return initializeWorld({
    initializers: { ...initializers, SPACESHIPS: spaceships },
    whitelistEnabled: false,
    arena: true
  });
}

export async function initializeWorld({
  initializers,
  whitelistEnabled,
  arena = false,
}: InitializeWorldArgs): Promise<World> {
  const [deployer, user1, user2] = await hre.ethers.getSigners();

  // The tests assume that things get mined right away
  // TODO(#912): This means the tests are wildly fragile and probably need to be rewritten
  await hre.network.provider.send('evm_setAutomine', [true]);
  await hre.network.provider.send('evm_setIntervalMining', [0]);

  let contract: DarkForest;

  let deploy = arena ? deployAndCutArena : deployAndCut;

  const [diamond, diamondInit] = await deploy(
    { ownerAddress: deployer.address, whitelistEnabled, initializers, save: false },
    hre
  );
  contract = diamond;

  await deployer.sendTransaction({
    to: contract.address,
    value: utils.parseEther('0.5'), // good for about (100eth / 0.5eth/test) = 200 tests
  });

  return {
    // If any "admin only" contract state needs to be changed, use `contracts`
    // to call methods with deployer privileges. e.g. `world.contracts.core.pause()`
    contract,
    user1,
    user2,
    deployer,
    user1Core: contract.connect(user1),
    user2Core: contract.connect(user2),
  };
}
