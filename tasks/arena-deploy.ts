import { task, types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import ts from 'typescript';
import * as settings from '../settings';
import { deployContract, deployDiamond, saveDeploy, writeToContractsPackage } from '../utils/deploy';
import { DiamondChanges } from '../utils/diamond';



task('arena:deploy', 'deploy all arena contracts')
  .addOptionalParam('whitelist', 'override the whitelist', false, types.boolean)
  .addOptionalParam('faucet', 'deploy the faucet', false, types.boolean)
  .addOptionalParam('fund', 'amount of eth to fund faucet contract for fund', 0, types.float)
  .addOptionalParam(
    'subgraph',
    'bring up subgraph with name (requires docker)',
    undefined,
    types.string
  )
  .setAction(deploy);

async function deploy(
  args: { whitelist?: boolean; fund: number; subgraph?: string, faucet?: boolean },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  let whitelistEnabled = false;
  // if (typeof args.whitelist === 'undefined') {
  //   // `whitelistEnabled` defaults to `false` in dev but `true` in prod
  //   whitelistEnabled = isDev ? false : true;
  // } else {
  //   whitelistEnabled = args.whitelist;
  // }

  // Ensure we have required keys in our initializers
  settings.required(hre.initializers, ['PLANETHASH_KEY', 'SPACETYPE_KEY', 'BIOMEBASE_KEY']);

  // need to force a compile for tasks
  await hre.run('compile');

  // Were only using one account, getSigners()[0], the deployer.
  // Is deployer of all contracts, but ownership is transferred to ADMIN_PUBLIC_ADDRESS if set
  const [deployer] = await hre.ethers.getSigners();

  const requires = hre.ethers.utils.parseEther('5');
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

  const [diamond, diamondInit, initReceipt] = await deployAndCutArena(
    { ownerAddress: deployer.address, whitelistEnabled, initializers: hre.initializers },
    hre
  );

  if (whitelistEnabled && args.fund > 0) {
    // Note Ive seen `ProviderError: Internal error` when not enough money...
    console.log(`funding whitelist with ${args.fund}`);

    const tx = await deployer.sendTransaction({
      to: diamond.address,
      value: hre.ethers.utils.parseEther(args.fund.toString()),
    });
    await tx.wait();

    console.log(
      `Sent ${args.fund} to diamond contract (${diamond.address}) to fund drips in whitelist facet`
    );

    const whitelistBalance = await hre.ethers.provider.getBalance(diamond.address);
    console.log(`Whitelist balance ${whitelistBalance}`);
  }

  // give all contract administration over to an admin adress if was provided
  if (hre.ADMIN_PUBLIC_ADDRESS) {
    const ownership = await hre.ethers.getContractAt('DarkForest', diamond.address);
    const tx = await ownership.transferOwnership(hre.ADMIN_PUBLIC_ADDRESS);
    await tx.wait();
    console.log(`transfered diamond ownership to ${hre.ADMIN_PUBLIC_ADDRESS}`);
  }

  if (args.subgraph) {
    await hre.run('subgraph:deploy', { name: args.subgraph });
    console.log('deployed subgraph');
  }

  if (args.faucet) {
    console.log('calling faucet')
    await hre.run('faucet:deploy', {value: args.fund});
    console.log('deployed faucet');

  }

  // TODO: Upstream change to update task name from `hardhat-4byte-uploader`
  if (!isDev) {
    try {
      await hre.run('upload-selectors', { noCompile: true });
    } catch {
      console.warn('WARNING: Unable to update 4byte database with our selectors');
      console.warn('Please run the `upload-selectors` task manually so selectors can be reversed');
    }
  }

  console.log('Deployed successfully. Godspeed cadet.');
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
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  const changes = new DiamondChanges();

  const Verifier = (await deployContract('Verifier', {}, hre)).address;
  const LibGameUtils = (await deployContract('LibGameUtils', {}, hre)).address;
  const LibLazyUpdate = (await deployContract('LibLazyUpdate', {}, hre)).address;
  const LibArtifactUtils = (await deployContract('LibArtifactUtils', { LibGameUtils }, hre))
    .address;
  const LibPlanet = (
    await deployContract('LibPlanet', { LibGameUtils, LibLazyUpdate, Verifier }, hre)
  ).address;

  // const { LibGameUtils, LibArtifactUtils, LibPlanet } = await deployLibraries({}, hre);

  // Diamond Spec facets
  // Note: These won't be updated during an upgrade without manual intervention
  const diamondCutFacet = await deployContract('DiamondCutFacet', {}, hre);
  const diamondLoupeFacet = await deployContract('DiamondLoupeFacet', {}, hre);
  const ownershipFacet = await deployContract('OwnershipFacet', {}, hre);

  // The `cuts` to perform for Diamond Spec facets
  const diamondSpecFacetCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DiamondLoupeFacet', diamondLoupeFacet),
    ...changes.getFacetCuts('OwnershipFacet', ownershipFacet),
  ];

  const diamond = await deployDiamond(
    {
      ownerAddress,
      // The `diamondCutFacet` is cut upon deployment
      diamondCutAddress: diamondCutFacet.address,
    },
    {},
    hre
  );

  const diamondInit = await deployContract('DFInitialize', { LibGameUtils }, hre);

  // Dark Forest facets
  const coreFacet = await deployContract(
    'DFCoreFacet',
    { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet },
    hre
  );
  const moveFacet = await deployContract(
    'DFMoveFacet',
    { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet },
    hre
  );
  const captureFacet = await deployContract('DFCaptureFacet', { LibPlanet }, hre);
  const artifactFacet = await deployContract('DFArtifactFacet', {}, hre);
  const getterFacet = await deployContract('DFGetterFacet', { LibGameUtils }, hre);
  const whitelistFacet = await deployContract('DFWhitelistFacet', {}, hre);
  const adminFacet = await deployContract(
    'DFAdminFacet',
    { LibArtifactUtils, LibGameUtils, LibPlanet },
    hre
  );
  const lobbyFacet = await deployContract('DFLobbyFacet', {}, hre);

  // The `cuts` to perform for Dark Forest facets
  const darkForestFacetCuts = [
    ...changes.getFacetCuts('DFCoreFacet', coreFacet),
    ...changes.getFacetCuts('DFMoveFacet', moveFacet),
    ...changes.getFacetCuts('DFCaptureFacet', captureFacet),
    ...changes.getFacetCuts('DFArtifactFacet', artifactFacet),
    ...changes.getFacetCuts('DFGetterFacet', getterFacet),
    ...changes.getFacetCuts('DFWhitelistFacet', whitelistFacet),
    ...changes.getFacetCuts('DFAdminFacet', adminFacet),
    ...changes.getFacetCuts('DFLobbyFacet', lobbyFacet),
  ];

  const toCut = [...diamondSpecFacetCuts, ...darkForestFacetCuts];

  const diamondCut = await hre.ethers.getContractAt('DarkForest', diamond.address);

  const tokenBaseUri = `${
    isDev
      ? 'https://nft-test.zkga.me/token-uri/artifact/'
      : 'https://nft.zkga.me/token-uri/artifact/'
  }${hre.network.config?.chainId || 'unknown'}-${diamond.address}/`;

  // EIP-2535 specifies that the `diamondCut` function takes two optional
  // arguments: address _init and bytes calldata _calldata
  // These arguments are used to execute an arbitrary function using delegatecall
  // in order to set state variables in the diamond during deployment or an upgrade
  // More info here: https://eips.ethereum.org/EIPS/eip-2535#diamond-interface

  const initAddress = diamondInit.address;
  const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    initializers,
  ]);

  const initTx = await diamondCut.diamondCut(toCut, initAddress, initFunctionCall);
  const initReceipt = await initTx.wait();
  if (!initReceipt.status) {
    throw Error(`Diamond cut failed: ${initTx.hash}`);
  }
  console.log('Completed diamond cut');

  const [arenaDiamond, arenaDiamondInit, arenaDiamondInitReceipt] = await cutArena(
    diamond.address,
    hre,
    { LibGameUtils, LibPlanet, LibArtifactUtils, Verifier },
    whitelistEnabled,
    tokenBaseUri,
    initializers
  );
  await saveDeploy(
    {
      coreBlockNumber: initReceipt.blockNumber,
      diamondAddress: arenaDiamond.address,
      initAddress: arenaDiamondInit.address,
      libraries: { Verifier, LibGameUtils, LibArtifactUtils, LibPlanet },
    },
    hre
  );

  return [arenaDiamond, arenaDiamondInit, arenaDiamondInitReceipt] as const;
}

export async function cutArena(
  diamondAddress: string,
  hre: HardhatRuntimeEnvironment,
  { LibGameUtils, LibPlanet, LibArtifactUtils, Verifier }: Libraries,
  whitelistEnabled: boolean,
  tokenBaseUri: string,
  initializers: HardhatRuntimeEnvironment['initializers']
) {

  const origDiamond = await hre.ethers.getContractAt('DarkForest', diamondAddress);

  const lobbyInitAddress = hre.ethers.constants.AddressZero;
  const lobbyInitFunctionCall = '0x';

  // Make Lobby
  const tx = await origDiamond.createLobby(lobbyInitAddress, lobbyInitFunctionCall);
  const rc = await tx.wait();
  if (!rc.events) throw Error('No event occurred');

  const event = rc.events.find((event: any) => event.event === 'LobbyCreated');
  if (!event || !event.args) throw Error('No event found');

  const lobbyAddress = event.args.lobbyAddress;

  if (!lobbyAddress) throw Error('No lobby address found');

  console.log(`lobby Diamond created at ${lobbyAddress}`);

  const diamond = await hre.ethers.getContractAt('DarkForest', lobbyAddress);

  const prevFacets = await diamond.facets();

  const changes = new DiamondChanges(prevFacets);
  const diamondInit = await deployContract('DFArenaInitialize', { LibGameUtils }, hre);
  const arenaCoreFacet = await deployContract('DFArenaCoreFacet', { LibGameUtils, LibPlanet }, hre);
  const arenaGetterFacet = await deployContract('DFArenaGetterFacet', {}, hre);
  const spaceshipConfigFacet = await deployContract('DFSpaceshipConfigFacet', {LibGameUtils}, hre);
  const tournamentFacet = await deployContract('DFArenaTournamentFacet', {}, hre);


  const arenaFacetCuts = [
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),
    ...changes.getFacetCuts('DFSpaceshipConfigFacet', spaceshipConfigFacet),
    ...changes.getFacetCuts('DFArenaTournamentFacet', tournamentFacet),
  ];

  const diamondCut = await hre.ethers.getContractAt('DarkForest', diamond.address);

  const initAddress = diamondInit.address;
  const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    initializers,
  ]);

  const initTx = await diamondCut.diamondCut(arenaFacetCuts, initAddress, initFunctionCall);
  const initReceipt = await initTx.wait();
  if (!initReceipt.status) {
    throw Error(`Diamond cut failed: ${initTx.hash}`);
  }
  console.log('Completed diamond cut of Arena facets');

  return [diamond, diamondInit, initReceipt] as const;
}
