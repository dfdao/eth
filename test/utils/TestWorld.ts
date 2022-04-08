import type { DarkForest } from '@darkforest_eth/contracts/typechain';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, Contract, utils } from 'ethers';
import hre from 'hardhat';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployAndCut } from '../../tasks/deploy';
import { initializers, noPlanetTransferInitializers, OPTIMISM_CHAIN_ID, target4Initializers } from './WorldConstants';
import InitABI from "@darkforest_eth/contracts/abis/DFInitialize.json";
import { LobbyCreatedEvent } from '@darkforest_eth/contracts/typechain/DarkForest';

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

export async function initializeWorld({
  initializers,
  whitelistEnabled,
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

  const contract = await hre.ethers.getContractAt('DarkForest', diamond.address);

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

// Requires that Dark Forest contracts are deployed to local Optimism first.
// This is so testing just requires making a lobby, which is much faster than an entire deploy
export async function initializeOptimismWorld({
    initializers,
    whitelistEnabled,
  }: InitializeWorldArgs): Promise<World> {
  const [deployer, user1, user2] = await hre.ethers.getSigners();

  if(hre.network.name !== "local_optimism") throw Error('Not on local Optimism');
  if(!hre.contracts.CONTRACT_ADDRESS || !hre.contracts.INIT_ADDRESS) throw Error ("No contract addresses found");

  // Mirroring client code in CreateLobby.tsx
  const artifactBaseURI = '';
  const initInterface = Contract.getInterface(InitABI);
  const initAddress = hre.contracts.INIT_ADDRESS;
  const initFunctionCall = initInterface.encodeFunctionData('init', [
    whitelistEnabled, 
    artifactBaseURI,
    initializers,
  ]);

  const diamond = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);

  // Make Lobby
  const tx = await diamond.createLobby(initAddress,initFunctionCall);
  const rc = await tx.wait();
  if(!rc.events) throw Error ("No event occurred");
  
  const event = rc.events.find(event => event.event === 'LobbyCreated') as LobbyCreatedEvent;

  const contract = await hre.ethers.getContractAt('DarkForest', event.args.lobbyAddress);
  console.log(`created lobby at ${contract.address}`);
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
