import type { DarkForest, DFArenaInitialize, Diamond } from '@darkforest_eth/contracts/typechain';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { deployAndCut } from '../../tasks/deploy';
import { deployAndCutArena, deployArenaDiamondInit, deployLibraries } from '../../tasks/arena';
import {
  initializers,
  manualSpawnInitializers,
  targetPlanetInitializers,
  noPlanetTransferInitializers,
  target4Initializers,
  arenaInitializers,
} from './WorldConstants';
import { LobbyCreatedEvent } from '@darkforest_eth/contracts/typechain/DFLobbyFacet';
import { DiamondChanges } from '../../utils/diamond';
import { deployArenaCoreFacet, deployArenaGetterFacet } from '../../tasks/utils';
import { Initializers } from '@darkforest_eth/settings';

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
    contract = await cutArenaFromLobby(hre, contract, initializers, whitelistEnabled);
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

/* Assumes libraries have alrady been deployed */
async function cutArenaFromLobby(
  hre: HardhatRuntimeEnvironment,
  contract: DarkForest,
  initializers: Initializers,
  whitelistEnabled : boolean
): Promise<DarkForest> {
  const initAddress = hre.ethers.constants.AddressZero;
  const initFunctionCall = '0x';

  // Make Lobby
  const tx = await contract.createLobby(initAddress, initFunctionCall);
  const rc = await tx.wait();
  if (!rc.events) throw Error('No event occurred');

  const event = rc.events.find((event) => event.event === 'LobbyCreated') as LobbyCreatedEvent;

  const lobbyAddress = event.args.lobbyAddress;

  if (!lobbyAddress) throw Error('No lobby address found');

  // Connect to Lobby Diamond and check ownership
  const lobby = await hre.ethers.getContractAt('DarkForest', lobbyAddress);
  const prevFacets = await lobby.facets();

  const changes = new DiamondChanges(prevFacets);

  const libraries: Libraries = {
    Verifier: hre.contracts.VERIFIER_ADDRESS,
    LibGameUtils: hre.contracts.LIB_GAME_UTILS_ADDRESS,
    LibArtifactUtils: hre.contracts.LIB_ARTIFACT_UTILS_ADDRESS,
    LibPlanet: hre.contracts.LIB_PLANET_ADDRESS,
  };

  const diamondInit = await deployArenaDiamondInit({}, libraries, hre);

  const arenaCoreFacet = await deployArenaCoreFacet({}, libraries, hre);
  const arenaGetterFacet = await deployArenaGetterFacet({}, libraries, hre);

  const arenaDiamondCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
  ];

  const toCut = [...arenaDiamondCuts];

  const tokenBaseUri = `${'https://nft-test.zkga.me/token-uri/artifact/'}${
    hre.network.config?.chainId || 'unknown'
  }-${lobby.address}/`;

  const diamondInitAddress = diamondInit.address;
  const diamondInitFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    initializers,
  ]);


  const arenaTx = await lobby.diamondCut(toCut, diamondInitAddress, diamondInitFunctionCall);
  const arenaReceipt = await arenaTx.wait();
  if (!arenaReceipt.status) {
    throw Error(`Diamond cut failed: ${arenaTx.hash}`);
  }

  console.log('Completed diamond cut');
  return lobby;
}
