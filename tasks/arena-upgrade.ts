import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DiamondChanges } from '../utils/diamond';

import { deployContract, saveDeploy } from '../utils/deploy';
import { Contract } from 'ethers';

task('arena:upgrade', 'upgrade a lobby from the command line').setAction(deployUpgrades);

export async function deployUpgrades({}, hre: HardhatRuntimeEnvironment) {
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

  const whitelistEnabled = false;

  const contract = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);

  return await cutUpgradesFromLobby(hre, contract, hre.initializers, whitelistEnabled);
}

export async function cutUpgradesFromLobby(
  hre: HardhatRuntimeEnvironment,
  contract: Contract,
  initializers: HardhatRuntimeEnvironment['initializers'],
  whitelistEnabled: boolean = false
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';
  const initAddress = hre.ethers.constants.AddressZero;
  const initFunctionCall = '0x';

  // Make Lobby
  const tx = await contract.createLobby(initAddress, initFunctionCall);
  const rc = await tx.wait();
  if (!rc.events) throw Error('No event occurred');

  // @ts-expect-error because event is type unknown
  const event = rc.events.find((event) => event.event === 'LobbyCreated');

  const lobbyAddress = event.args.lobbyAddress;

  if (!lobbyAddress) throw Error('No lobby address found');

  // Connect to Lobby Diamond and check ownership
  const lobby = await hre.ethers.getContractAt('DarkForest', lobbyAddress);
  const prevFacets = await lobby.facets();

  const changes = new DiamondChanges(prevFacets);

  const Verifier = hre.contracts.VERIFIER_ADDRESS;
  const LibGameUtils = hre.contracts.LIB_GAME_UTILS_ADDRESS;
  const LibArtifactUtils = hre.contracts.LIB_ARTIFACT_UTILS_ADDRESS;
  const LibPlanet = hre.contracts.LIB_PLANET_ADDRESS;

  const diamondInit = await deployContract('DFArenaInitialize', { LibGameUtils }, hre);

  const arenaCoreFacet = await deployContract(
    'DFArenaCoreFacet',
    { LibGameUtils, LibPlanet },
    hre
  );

  const arenaGetterFacet = await deployContract('DFArenaGetterFacet', {}, hre);

  const arenaDiamondCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
  ];

  const toCut = [...arenaDiamondCuts];

  const tokenBaseUri = `${
    isDev
      ? 'https://nft-test.zkga.me/token-uri/artifact/'
      : 'https://nft.zkga.me/token-uri/artifact/'
  }${hre.network.config?.chainId || 'unknown'}-${lobby.address}/`;

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

  await saveDeploy(
    {
      coreBlockNumber: arenaReceipt.blockNumber,
      diamondAddress: lobby.address,
      initAddress: diamondInit.address,
      libraries: { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet },
    },
    hre
  );

  console.log('Arena created successfully. Godspeed cadet.');

  return [lobby, diamondInit, arenaReceipt] as const;
}
