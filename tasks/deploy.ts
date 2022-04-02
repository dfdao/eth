import * as fs from 'fs';
import { task, types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import * as path from 'path';
import * as prettier from 'prettier';
import * as settings from '../settings';
import { DiamondChanges } from '../utils/diamond';
import { tscompile } from '../utils/tscompile';
import {
  deployAdminFacet,
  deployArenaCoreFacet,
  deployArenaGetterFacet,
  deployArtifactFacet,
  deployCaptureFacet,
  deployCoreFacet,
  deployDiamond,
  deployDiamondCutFacet,
  deployDiamondInit,
  deployDiamondLoupeFacet,
  deployGetterFacet,
  deployLibraries,
  deployLobbyFacet,
  deployMoveFacet,
  deployOwnershipFacet,
  deployUpgradeDiamondInit,
  deployWhitelistFacet,
  saveDeploy,
} from './utils';

task('deploy', 'deploy all contracts')
  .addOptionalParam('whitelist', 'override the whitelist', undefined, types.boolean)
  .addOptionalParam('fund', 'amount of eth to fund whitelist contract for fund', 0.5, types.float)
  .addOptionalParam(
    'subgraph',
    'bring up subgraph with name (requires docker)',
    undefined,
    types.string
  )
  .setAction(deploy);

async function deploy(
  args: { whitelist?: boolean; fund: number; subgraph?: string },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  let whitelistEnabled: boolean;
  if (typeof args.whitelist === 'undefined') {
    // `whitelistEnabled` defaults to `false` in dev but `true` in prod
    whitelistEnabled = isDev ? false : true;
  } else {
    whitelistEnabled = args.whitelist;
  }

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

  const [diamond, diamondInit, initReceipt] = await deployAndCut(
    { ownerAddress: deployer.address, whitelistEnabled, initializers: hre.initializers },
    hre
  );

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

  const whitelistBalance = await hre.ethers.provider.getBalance(diamond.address);
  console.log(`Whitelist balance ${whitelistBalance}`);

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

export async function deployAndCut(
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

  const libraries = await deployLibraries({}, hre);

  // Diamond Spec facets
  // Note: These won't be updated during an upgrade without manual intervention
  const diamondCutFacet = await deployDiamondCutFacet({}, libraries, hre);
  const diamondLoupeFacet = await deployDiamondLoupeFacet({}, libraries, hre);
  const ownershipFacet = await deployOwnershipFacet({}, libraries, hre);

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
    libraries,
    hre
  );

  const diamondInit = await deployUpgradeDiamondInit({}, libraries, hre);

  // Dark Forest facets
  const coreFacet = await deployCoreFacet({}, libraries, hre);
  const moveFacet = await deployMoveFacet({}, libraries, hre);
  const captureFacet = await deployCaptureFacet({}, libraries, hre);

  const artifactFacet = await deployArtifactFacet(
    { diamondAddress: diamond.address },
    libraries,
    hre
  );
  const getterFacet = await deployGetterFacet({}, libraries, hre);
  const whitelistFacet = await deployWhitelistFacet({}, libraries, hre);
  const adminFacet = await deployAdminFacet({}, libraries, hre);
  const lobbyFacet = await deployLobbyFacet({}, {}, hre);

  const arenaCoreFacet = await deployArenaCoreFacet({}, libraries, hre);
  const arenaGetterFacet = await deployArenaGetterFacet({}, libraries, hre);

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
    ...changes.getFacetCuts('DFArenaCoreFacet', arenaCoreFacet),
    ...changes.getFacetCuts('DFArenaGetterFacet', arenaGetterFacet),


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

  await saveDeploy(
    {
      coreBlockNumber: initReceipt.blockNumber,
      diamondAddress: diamond.address,
      initAddress: diamondInit.address,
      libraries: libraries,
    },
    hre
  );
  
  return [diamond, diamondInit, initReceipt] as const;
}
