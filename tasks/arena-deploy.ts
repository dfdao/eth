import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import { DiamondChanges } from '../utils/diamond';

task('arena:create', 'create a lobby from the command line').setAction(deployArena);

async function deployArena({}, hre: HardhatRuntimeEnvironment): Promise<void> {
  console.log("creating lobby and cutting arena facets")
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

  return await deployAndCutArena(
    {ownerAddress: deployer.address, whitelistEnabled: false, initializers: hre.initializers

  }, hre)

}

export async function deployAndCutArena(
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
  console.log(hre.network.name)
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';
  const [deployer] = await hre.ethers.getSigners();

  const libraries = await deployLibraries({}, hre);

  const diamondInit = await deployArenaDiamondInit({}, libraries, hre);

  const { abi: InitABI } = await hre.artifacts.readArtifact('DFArenaInitialize');
  const initInterface = hre.ethers.Contract.getInterface(InitABI);

  const artifactBaseURI = '';

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

    
    return [diamond, diamondInit, arenaReceipt] as const;
  
  }

  const baseURI = isDev ? 'http://localhost:8081' : 'https://zkga.me';

  const contract = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);

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

  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Lobby creation failed: ${tx.hash}`);
  } else {
    console.log("Lobby created successfully");
  }
  await result;
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
  {}: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFArenaGetterFacet', {
  });
  const contract = await factory.deploy();
  await contract.deployTransaction.wait();
  console.log(`DFArenaGetterFacet deployed to: ${contract.address}`);
  return contract;
}