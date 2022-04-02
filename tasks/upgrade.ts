import * as fs from 'fs';

import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { DiamondChanges } from '../utils/diamond';
import * as path from 'path';
import * as prettier from 'prettier';
import { tscompile } from '../utils/tscompile';
import { deployAndCut } from './deploy';
import { deployArenaCoreFacet, deployArenaGetterFacet, deployLibraries, deployUpgradeDiamondInit, saveDeploy } from './utils';

task('arena:upgrade', 'upgrade a lobby from the command line').setAction(deployUpgrades);

export async function deployUpgrades(
  {},
  hre: HardhatRuntimeEnvironment
) {
  console.log('creating lobby and cutting arena facets');
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  const [deployer] = await hre.ethers.getSigners();

  const requires = hre.ethers.utils.parseEther('4');
  const balance = await deployer.getBalance();

  // Only when deploying to production, give the deployer wallet money,
  // in order for it to be able to deploy the contracts
  if (!isDev && balance.lt(requires)) {
    throw new Error(
      `${deployer.address} requires ~$${hre.ethers.utils.formatEther(
        requires
      )} but has ${hre.ethers.utils.formatEther(balance)} top up and rerun`
    );
  }


  const lobbyAddress = await deployLobbyWithDiamond(hre, hre.initializers);

  const diamond = await hre.ethers.getContractAt('DarkForest', lobbyAddress);

  const prevFacets = await diamond.facets();

  const changes = new DiamondChanges(prevFacets);

  const libraries = await deployLibraries({}, hre);

  const diamondInit = await deployUpgradeDiamondInit({}, libraries, hre);

  const arenaCoreFacet = await deployArenaCoreFacet({}, libraries, hre);
  
  const arenaGetterFacet = await deployArenaGetterFacet({}, libraries, hre);

  const arenaDiamondCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
  ];

  const shouldUpgrade = await changes.verify();
  if (!shouldUpgrade) {
    console.log('Upgrade aborted');
    throw 'upgrade aborted';
  }

  const whitelistEnabled = false
  const tokenBaseUri = `${
    isDev
      ? 'https://nft-test.zkga.me/token-uri/artifact/'
      : 'https://nft.zkga.me/token-uri/artifact/'
  }${hre.network.config?.chainId || 'unknown'}-${diamond.address}/`;

  const toCut = [...arenaDiamondCuts];

  const initAddress = diamondInit.address;
  const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    hre.initializers,
  ]);

  const arenaTx = await diamond.diamondCut(toCut, initAddress, initFunctionCall);
  const arenaReceipt = await arenaTx.wait();
  if (!arenaReceipt.status) {
    throw Error(`Diamond cut failed: ${arenaTx.hash}`);
  }

  console.log('Completed diamond cut');

  // TODO: Upstream change to update task name from `hardhat-4byte-uploader`
  if (!isDev) {
    try {
      await hre.run('upload-selectors', { noCompile: true });
    } catch {
      console.warn('WARNING: Unable to update 4byte database with our selectors');
      console.warn('Please run the `upload-selectors` task manually so selectors can be reversed');
    }
  }

  await saveDeploy(
    {
      coreBlockNumber: arenaReceipt.blockNumber,
      diamondAddress: diamond.address,
      initAddress: diamondInit.address,
      libraries: libraries,
    },
    hre
  );

  console.log('Arena created successfully. Godspeed cadet.');

  return [diamond, diamondInit, arenaReceipt] as const;
}

export async function deployLobbyWithDiamond(
  hre: HardhatRuntimeEnvironment,
  initializers: HardhatRuntimeEnvironment["initializers"]
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';
  // Were only using one account, getSigners()[0], the deployer. Becomes the ProxyAdmin
  const [deployer] = await hre.ethers.getSigners();

  // TODO: The deployer balance should be checked for production.
  // Need to investigate how much this actually costs.

  const baseURI = isDev ? 'http://localhost:8081' : 'https://zkga.me';

  const contract = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);

  const { abi: InitABI } = await hre.artifacts.readArtifact('DFArenaInitialize');

  const artifactBaseURI = '';
  const whitelistEnabled = false;

  const initAddress = hre.ethers.constants.AddressZero;
  const initFunctionCall = '0x';

  function waitForCreated(): Promise<string> {
    return new Promise(async (resolve) => {
      contract.on('LobbyCreated', async (ownerAddress, lobbyAddress) => {
        if (deployer.address === ownerAddress) {
          console.log(`Lobby created. Play at ${baseURI}/play/${lobbyAddress}`);
          resolve(lobbyAddress);
        }
      });
    });
  }

  // We setup the event handler before creating the lobby
  const result = waitForCreated();

  const tx = await contract.createLobby(initAddress, initFunctionCall);

  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Lobby creation failed: ${tx.hash}`);
  }

  const lobbyAddress = await result;

  return lobbyAddress;
}

export async function deployAndCutUpgrades(
  {
    ownerAddress,
    whitelistEnabled,
    initializers,
  }: {
    ownerAddress: string;
    whitelistEnabled: boolean;
    initializers: HardhatRuntimeEnvironment['initializers'];
  },
  hre: HardhatRuntimeEnvironment
) {
  console.log('deploying DarkForest and cutting arena facets')
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  const [diamond] = await deployAndCut(
    { ownerAddress, whitelistEnabled, initializers },
    hre
  );

  const diamondCut = await hre.ethers.getContractAt('DarkForest', diamond.address);

  const prevFacets = await diamondCut.facets();

  const changes = new DiamondChanges(prevFacets);

  const libraries : Libraries = {
    Verifier: hre.contracts.VERIFIER_ADDRESS,
    LibGameUtils: hre.contracts.LIB_GAME_UTILS_ADDRESS,
    LibArtifactUtils: hre.contracts.LIB_ARTIFACT_UTILS_ADDRESS,
    LibPlanet : hre.contracts.LIB_PLANET_ADDRESS
  };

  const diamondInit = await deployUpgradeDiamondInit({}, libraries, hre);

  const arenaCoreFacet = await deployArenaCoreFacet({}, libraries, hre);
  const arenaGetterFacet = await deployArenaGetterFacet({}, libraries, hre);

  const arenaDiamondCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
  ];

  // const shouldUpgrade = await changes.verify();
  // if (!shouldUpgrade) {
  //   console.log('Upgrade aborted');
  //   throw 'upgrade aborted';
  // }

  const tokenBaseUri = `${
    isDev
      ? 'https://nft-test.zkga.me/token-uri/artifact/'
      : 'https://nft.zkga.me/token-uri/artifact/'
  }${hre.network.config?.chainId || 'unknown'}-${diamond.address}/`;

  const toCut = [...arenaDiamondCuts];

  const initAddress = diamondInit.address;
  const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    initializers,
  ]);

  const arenaTx = await diamondCut.diamondCut(toCut, initAddress, initFunctionCall);
  const arenaReceipt = await arenaTx.wait();
  if (!arenaReceipt.status) {
    throw Error(`Diamond cut failed: ${arenaTx.hash}`);
  }

  console.log('Completed diamond cut');

  // TODO: Upstream change to update task name from `hardhat-4byte-uploader`

  console.log('Arena created successfully. Godspeed cadet.');

  return [diamond, diamondInit, arenaReceipt] as const;
}
