import type { DarkForest, DFArenaInitialize, Diamond } from '@darkforest_eth/contracts/typechain';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { deployAndCut } from '../../tasks/deploy';
import { cutUpgradesFromLobby } from '../../tasks/upgrade';
import {
  initializers,
  manualSpawnInitializers,
  targetPlanetInitializers,
  noPlanetTransferInitializers,
  target4Initializers,
  arenaInitializers,
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
  baseFacets?: boolean;
}

export function defaultWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers,
    whitelistEnabled: false,
  });
}

export function arenaWorldFixture(): Promise<World> {
  return initializeWorld({
    initializers: arenaInitializers,
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
    // baseFacets: true
  });
}

export function noPlanetTransferFixture(): Promise<World> {
  return initializeWorld({
    initializers: noPlanetTransferInitializers,
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

export function baseGameFixture(): Promise<World> {
  return initializeWorld({
    initializers: initializers,
    whitelistEnabled: false,
    baseFacets: true,
  });
}

export async function initializeWorld({
  initializers,
  whitelistEnabled,
  baseFacets,
}: InitializeWorldArgs): Promise<World> {
  const [deployer, user1, user2] = await hre.ethers.getSigners();

  // The tests assume that things get mined right away
  // TODO(#912): This means the tests are wildly fragile and probably need to be rewritten
  await hre.network.provider.send('evm_setAutomine', [true]);
  await hre.network.provider.send('evm_setIntervalMining', [0]);

  // To test on vanilla Dark Forest facets (no Arena), set baseFacets to true
  let diamond: Diamond;
  let _initReceipt: DFArenaInitialize;
  [diamond, _initReceipt] = await deployAndCut(
    { ownerAddress: deployer.address, whitelistEnabled, initializers },
    hre
  );

  let contract: DarkForest = await hre.ethers.getContractAt('DarkForest', diamond.address);

  if (!baseFacets) {
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