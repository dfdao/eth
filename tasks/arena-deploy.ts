import * as fs from 'fs';
import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { DiamondChanges } from '../utils/diamond';
import * as path from 'path';
import * as prettier from 'prettier';
import { tscompile } from '../utils/tscompile';


task('arena:create', 'create a lobby from the command line').setAction(deployArena);

async function deployArena({}, hre: HardhatRuntimeEnvironment): Promise<void> {
  console.log("creating lobby and cutting arena facets")

  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  const libraries = await deployLibraries({}, hre);

  const diamondInit = await deployArenaDiamondInit({}, libraries, hre);

  // Were only using one account, getSigners()[0], the deployer. Becomes the ProxyAdmin
  const [deployer] = await hre.ethers.getSigners();

  // TODO: The deployer balance should be checked for production.
  // Need to investigate how much this actually costs.

  const baseURI = isDev ? 'http://localhost:8081' : 'https://zkga.me';

  const contract = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);
  // console.log(JSON.stringify(contract));

  const { abi: InitABI } = await hre.artifacts.readArtifact('contracts\\DFArenaInitialize.sol:DFArenaInitialize');
  const initInterface = hre.ethers.Contract.getInterface(InitABI);

  const whitelistEnabled = false;
  const artifactBaseURI = '';
  const initializers = { ...hre.initializers, DISABLE_ZK_CHECKS: true };

  const initAddress = diamondInit.address;
  const initFunctionCall = initInterface.encodeFunctionData('init', [
    whitelistEnabled,
    artifactBaseURI,
    initializers,
  ]);

  async function cutArenaFacets(address: string) {

    const diamond = await hre.ethers.getContractAt('DarkForest', address);

    const prevFacets = await diamond.facets();

    const changes = new DiamondChanges(prevFacets);

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
      return;
    }

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
  
    console.log('Arena created successfully. Godspeed cadet.');


    const arena = await hre.ethers.getContractAt("DarkForest", address);
    await saveDeploy(
      {
        coreBlockNumber: arenaReceipt.blockNumber,
        diamondAddress: diamond.address,
        initAddress: diamondInit.address,
      },
      hre
    );
    return [diamond, diamondInit, arenaReceipt] as const;
  
  }

  function waitForCreated(): Promise<void> {
    return new Promise(async (resolve) => {
      contract.on('LobbyCreated', async (ownerAddress, lobbyAddress) => {
        if (deployer.address === ownerAddress) {
          console.log(`Lobby created. Play at ${baseURI}/play/${lobbyAddress}`);
          await cutArenaFacets(lobbyAddress);
          resolve();
        }
      });
    });
  }

  // We setup the event handler before creating the lobby
  const result = waitForCreated();

  const tx = await contract.createLobby(initAddress, initFunctionCall);
  console.log("hello4")

  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Lobby creation failed: ${tx.hash}`);
  } else {
    console.log("Lobby created successfully");
  }

  await result;
}

export async function deployArenaCoreFacet(
  {},
  { LibGameUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFArenaCoreFacet', {
    libraries: {
      LibGameUtils,
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaCoreFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployArenaGetterFacet(
  {},
  { LibGameUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFArenaGetterFacet', {
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaGetterFacet deployed to: ${contract.address}`);
  return contract;
}

async function deployArenaDiamondInit({}, { LibGameUtils }: Libraries, hre: HardhatRuntimeEnvironment) {
  // DFInitialize provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const factory = await hre.ethers.getContractFactory('DFArenaInitialize', {
    libraries: { LibGameUtils },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaInitialize deployed to: ${contract.address}`);
  return contract;
}

export async function deployLibraries({}, hre: HardhatRuntimeEnvironment) {
  const VerifierFactory = await hre.ethers.getContractFactory('Verifier');
  const Verifier = await VerifierFactory.deploy();
  await Verifier.deployTransaction.wait();
  console.log(`Verifier deployed to: ${Verifier.address}`);

  const LibGameUtilsFactory = await hre.ethers.getContractFactory('LibGameUtils');
  const LibGameUtils = await LibGameUtilsFactory.deploy();
  await LibGameUtils.deployTransaction.wait();
  console.log(`LibGameUtils deployed to: ${LibGameUtils.address}`);

  const LibLazyUpdateFactory = await hre.ethers.getContractFactory('LibLazyUpdate');
  const LibLazyUpdate = await LibLazyUpdateFactory.deploy();
  await LibLazyUpdate.deployTransaction.wait();
  console.log(`LibLazyUpdate deployed to: ${LibLazyUpdate.address}`);

  const LibArtifactUtilsFactory = await hre.ethers.getContractFactory('LibArtifactUtils', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
    },
  });

  const LibArtifactUtils = await LibArtifactUtilsFactory.deploy();
  await LibArtifactUtils.deployTransaction.wait();
  console.log(`LibArtifactUtils deployed to: ${LibArtifactUtils.address}`);

  const LibPlanetFactory = await hre.ethers.getContractFactory('LibPlanet', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
      LibLazyUpdate: LibLazyUpdate.address,
      Verifier: Verifier.address,
    },
  });
  const LibPlanet = await LibPlanetFactory.deploy();
  await LibPlanet.deployTransaction.wait();
  console.log(`LibPlanet deployed to: ${LibPlanet.address}`);

  return {
    LibGameUtils: LibGameUtils.address,
    LibPlanet: LibPlanet.address,
    Verifier: Verifier.address,
    LibArtifactUtils: LibArtifactUtils.address,
  };
}

async function saveDeploy(
  args: {
    coreBlockNumber: number;
    diamondAddress: string;
    initAddress: string;
  },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  // Save the addresses of the deployed contracts to the `@darkforest_eth/contracts` package
  const tsContents = `
  /**
   * This package contains deployed contract addresses, ABIs, and Typechain types
   * for the Dark Forest game.
   *
   * ## Installation
   *
   * You can install this package using [\`npm\`](https://www.npmjs.com) or
   * [\`yarn\`](https://classic.yarnpkg.com/lang/en/) by running:
   *
   * \`\`\`bash
   * npm install --save @darkforest_eth/contracts
   * \`\`\`
   * \`\`\`bash
   * yarn add @darkforest_eth/contracts
   * \`\`\`
   *
   * When using this in a plugin, you might want to load it with [skypack](https://www.skypack.dev)
   *
   * \`\`\`js
   * import * as contracts from 'http://cdn.skypack.dev/@darkforest_eth/contracts'
   * \`\`\`
   *
   * ## Typechain
   *
   * The Typechain types can be found in the \`typechain\` directory.
   *
   * ## ABIs
   *
   * The contract ABIs can be found in the \`abis\` directory.
   *
   * @packageDocumentation
   */

  /**
   * The name of the network where these contracts are deployed.
   */
  export const NETWORK = '${hre.network.name}';
  /**
   * The id of the network where these contracts are deployed.
   */
  export const NETWORK_ID = ${hre.network.config.chainId};
  /**
   * The block in which the DarkForest contract was initialized.
   */
  export const START_BLOCK = ${isDev ? 0 : args.coreBlockNumber};
  /**
   * The address for the DarkForest contract.
   */
  export const CONTRACT_ADDRESS = '${args.diamondAddress}';
  /**
   * The address for the initalizer contract. Useful for lobbies.
   */
  export const INIT_ADDRESS = '${args.initAddress}';
  `;

  const { jsContents, dtsContents } = tscompile(tsContents);

  const contractsFileTS = path.join(hre.packageDirs['@darkforest_eth/contracts'], 'index.ts');
  const contractsFileJS = path.join(hre.packageDirs['@darkforest_eth/contracts'], 'index.js');
  const contractsFileDTS = path.join(hre.packageDirs['@darkforest_eth/contracts'], 'index.d.ts');

  const options = prettier.resolveConfig.sync(contractsFileTS);

  fs.writeFileSync(
    contractsFileTS,
    prettier.format(tsContents, { ...options, parser: 'babel-ts' })
  );
  fs.writeFileSync(
    contractsFileJS,
    prettier.format(jsContents, { ...options, parser: 'babel-ts' })
  );
  fs.writeFileSync(
    contractsFileDTS,
    prettier.format(dtsContents, { ...options, parser: 'babel-ts' })
  );
}