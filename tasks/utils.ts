import { subtask } from 'hardhat/config';
import { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { tscompile } from '../utils/tscompile';
import * as path from 'path';
import * as prettier from 'prettier';
import * as fs from 'fs';

subtask('utils:assertChainId', 'Assert proper network is selectaed').setAction(assertChainId);

async function assertChainId({}, hre: HardhatRuntimeEnvironment) {
  const { NETWORK_ID } = hre.contracts;

  if (hre.network.config.chainId !== NETWORK_ID) {
    throw new Error(
      `Hardhat defined network chain id ${hre.network.config.chainId} is NOT same as contracts network id: ${NETWORK_ID}.`
    );
  }
}

/*
Contract deployment
*/

export async function deployGetterFacet(
  {},
  { LibGameUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFGetterFacet', {
    libraries: {
      LibGameUtils,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log('DFGetterFacet deployed to:', contract.address);
  return contract;
}

export async function deployAdminFacet(
  {},
  { LibGameUtils, LibPlanet, LibArtifactUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFAdminFacet', {
    libraries: {
      LibArtifactUtils,
      LibGameUtils,
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFAdminFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployWhitelistFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFWhitelistFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFWhitelistFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployArtifactFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFArtifactFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArtifactFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployLibraries({}, hre: HardhatRuntimeEnvironment) {
  const VerifierFactory = await hre.ethers.getContractFactory('Verifier');
  const Verifier = await VerifierFactory.deploy();
  await Verifier.deployTransaction.wait();

  const LibGameUtilsFactory = await hre.ethers.getContractFactory('LibGameUtils');
  const LibGameUtils = await LibGameUtilsFactory.deploy();
  await LibGameUtils.deployTransaction.wait();

  const LibLazyUpdateFactory = await hre.ethers.getContractFactory('LibLazyUpdate');
  const LibLazyUpdate = await LibLazyUpdateFactory.deploy();
  await LibLazyUpdate.deployTransaction.wait();

  const LibArtifactUtilsFactory = await hre.ethers.getContractFactory('LibArtifactUtils', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
    },
  });

  const LibArtifactUtils = await LibArtifactUtilsFactory.deploy();
  await LibArtifactUtils.deployTransaction.wait();

  const LibPlanetFactory = await hre.ethers.getContractFactory('LibPlanet', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
      LibLazyUpdate: LibLazyUpdate.address,
      Verifier: Verifier.address,
    },
  });
  const LibPlanet = await LibPlanetFactory.deploy();
  await LibPlanet.deployTransaction.wait();

  return {
    LibGameUtils: LibGameUtils.address,
    LibPlanet: LibPlanet.address,
    Verifier: Verifier.address,
    LibArtifactUtils: LibArtifactUtils.address,
  };
}

export async function deployCoreFacet(
  {},
  { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFCoreFacet', {
    libraries: {
      Verifier,
      LibGameUtils,
      LibArtifactUtils,
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFCoreFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployMoveFacet(
  {},
  { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFMoveFacet', {
    libraries: {
      Verifier,
      LibGameUtils,
      LibArtifactUtils,
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFMoveFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployCaptureFacet(
  {},
  { LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFCaptureFacet', {
    libraries: {
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFCaptureFacet deployed to: ${contract.address}`);
  return contract;
}


export async function deployDiamondCutFacet({}, libraries: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DiamondCutFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DiamondCutFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployDiamond(
  {
    ownerAddress,
    diamondCutAddress,
  }: {
    ownerAddress: string;
    diamondCutAddress: string;
  },
  {}: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('Diamond');
  const contract = await factory.deploy(ownerAddress, diamondCutAddress);
  await contract.deployTransaction.wait();
  console.log(`Diamond deployed to: ${contract.address}`);
  return contract;
}

export async function deployDiamondInit({}, { LibGameUtils }: Libraries, hre: HardhatRuntimeEnvironment) {
  // DFInitialize provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const factory = await hre.ethers.getContractFactory('DFInitialize', {
    libraries: { LibGameUtils },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFInitialize deployed to: ${contract.address}`);
  return contract;
}

export async function deployDiamondLoupeFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DiamondLoupeFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DiamondLoupeFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployOwnershipFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('OwnershipFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`OwnershipFacet deployed to: ${contract.address}`);
  return contract;
}

export async function deployLobbyFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFLobbyFacet');
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFLobbyFacet deployed to: ${contract.address}`);
  return contract;
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

export async function deployArenaGetterFacet({}, {}: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFArenaGetterFacet', {});
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaGetterFacet deployed to: ${contract.address}`);
  return contract;
}


export async function saveDeploy(
  args: {
    coreBlockNumber: number;
    diamondAddress: string;
    initAddress: string;
    libraries : Libraries;
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
  /**
   * The address for the Verifier library. Useful for lobbies.
   */
  export const VERIFIER_ADDRESS = '${args.libraries.Verifier}';
  /**
   * The address for the LibGameUtils library. Useful for lobbies.
   */
  export const LIB_GAME_UTILS_ADDRESS = '${args.libraries.LibGameUtils}';
  /**
   * The address for the LibPlanet library. Useful for lobbies.
   */
  export const LIB_PLANET_ADDRESS = '${args.libraries.LibPlanet}';
  /**
   * The address for the LibArtifacts library. Useful for lobbies.
   */
  export const LIB_ARTIFACT_UTILS_ADDRESS = '${args.libraries.LibArtifactUtils}';
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

export async function deployUpgradeDiamondInit(
  {},
  { LibGameUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
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
