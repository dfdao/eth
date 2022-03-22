import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { DiamondChanges } from '../utils/diamond';

task('arena:create', 'create a lobby from the command line').setAction(deployArena);

async function deployArena({}, hre: HardhatRuntimeEnvironment): Promise<void> {
  console.log("deploying arena")

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

    const arenaCutFacet = await deployArenaFacet({}, libraries, hre);

    const arenaDiamondCuts = [
      // Note: The `diamondCut` is omitted because it is cut upon deployment
      ...changes.getFacetCuts('DFArenaFacet', arenaCutFacet),
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
  
    const upgradeTx = await diamond.diamondCut(toCut, initAddress, initFunctionCall);
    const upgradeReceipt = await upgradeTx.wait();
    if (!upgradeReceipt.status) {
      throw Error(`Diamond cut failed: ${upgradeTx.hash}`);
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
  
    console.log('Upgraded successfully. Godspeed cadet.');

    return address;
  
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
  console.log("herro")
}

export async function deployArenaFacet(
  {},
  { LibGameUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFArenaFacet', {
    libraries: {
      LibGameUtils,
      LibPlanet,
    },
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaFacet deployed to: ${contract.address}`);
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