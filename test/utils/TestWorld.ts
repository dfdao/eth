import type { DarkForest } from '@darkforest_eth/contracts/typechain';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployAndCut } from '../../tasks/arena-deploy';
import { cutUpgradesFromLobby } from '../../tasks/arena-upgrade';

import {
  arenaWorldInitializers,
  initializers,
  manualSpawnInitializers,
  noPlanetTransferInitializers,
  target4Initializers,
  targetPlanetInitializers,
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
  upgrade?: boolean;
}

export function defaultWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers,
    whitelistEnabled: false,
  });
}

/*
Idential to defaultWorldFixture but without upgrade facets cut in
*/
export function baseWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers,
    whitelistEnabled: false,
    upgrade: false
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

export function arenaWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers: arenaWorldInitializers,
    whitelistEnabled: false,
  });
}

export function manualSpawnFixture(): Promise<World> {
  return initializeWorld({
    initializers: manualSpawnInitializers,
    whitelistEnabled: false,
  });
}

export function targetPlanetFixture(): Promise<World> {
  return initializeWorld({
    initializers: targetPlanetInitializers,
    whitelistEnabled: false,
  });
}

export async function initializeWorld({
  initializers,
  whitelistEnabled,
  upgrade = true,
}: InitializeWorldArgs): Promise<World> {
  const [deployer, user1, user2] = await hre.ethers.getSigners();

  // The tests assume that things get mined right away
  // TODO(#912): This means the tests are wildly fragile and probably need to be rewritten
  await hre.network.provider.send('evm_setAutomine', [true]);
  await hre.network.provider.send('evm_setIntervalMining', [0]);

  const [diamond, _initReceipt] = await deployAndCut(
    { ownerAddress: deployer.address, whitelistEnabled, initializers },
    hre
  );

  let contract = await hre.ethers.getContractAt('DarkForest', diamond.address);

  if (upgrade) {
    [contract] = await cutUpgradesFromLobby(hre, contract, initializers, whitelistEnabled);
  }
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
