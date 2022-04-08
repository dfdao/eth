import { fakeHash, mimcHash, perlin } from '@darkforest_eth/hashing';
import { ContractTransaction } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { makeRevealProof } from './game';

// You can fill out these values if you know your contract addresses already.
const GNOSIS_OPTIMISM = '0x16d136627E2C3D930d3ae492816e09a359953f9a';
const XDAI = '0x688c78df6b8b64be16a7702df10ad64100079a68';
const LOCALHOST = '0x500cf53555c09948f4345594F9523E7B444cD67E';
const LOCAL_OPTIMISM = '0x59c7D03d2E9893FB7bAa89dA50a9452e1e9B8b90';
const CONTRACT_ADDRESSES = {
  'localhost': LOCALHOST,
  'xdai': XDAI,
  'gnosis_optimism': GNOSIS_OPTIMISM,
  'optimism': LOCAL_OPTIMISM
}

// Wait for tx to confirm and log time between submit and confirm
async function waitWithMetrics(tx: ContractTransaction, hre: HardhatRuntimeEnvironment, name?: string): Promise<void> {
  try {
    var startTime = performance.now()
    const receipt = await tx.wait();
    var endTime = performance.now()
    console.log(`${name} confirmed ${endTime - startTime} milliseconds`)
    console.log(`confirmed with ${receipt.confirmations} blocks, ${receipt.gasUsed} gas used and ${tx.gasPrice} price (wei)`);  
  } catch (error) {
    console.error(`ERROR`)
    await hre.run('utils:logRevertReason', {txHash: tx.hash});
  }
}

// Utility for getting Dark Forest contracts from address or CONTRACT_ADDRESSES
async function fetchContract(hre: HardhatRuntimeEnvironment, address?: string) {
  const [deployer] = await hre.ethers.getSigners()

  // @ts-expect-error
  const finalAddress = address ? address : CONTRACT_ADDRESSES[hre.network.name];
  const contract = await hre.ethers.getContractAt('DarkForest', finalAddress);
  if(!contract) throw new Error(`Dark Forest contract not found at address ${finalAddress}`);

  const admin = await contract.adminAddress();
  if(deployer.address.toLowerCase() !== admin.toLowerCase()) throw new Error (`${deployer.address} is not admin ${admin}`)

  return contract;
}

task('metrics:pause_unpause', 'make a simple contract call to the game')
  .addOptionalPositionalParam('address', 'game contract addresss', undefined, types.string)
  .setAction(gamePauseUnpause);

async function gamePauseUnpause(args: { address: string }, hre: HardhatRuntimeEnvironment) {
  // Don't assert chainId because want to be able to connect to Dark Forest on different networks
  // await hre.run('utils:assertChainId');

  console.log(`timing pause/unpause on ${hre.network.name}`);

  const contract = await fetchContract(hre, args.address);
  console.log(`polling interval`, hre.ethers.provider.pollingInterval);

  // Read call
  const paused = await contract.paused();
  console.log(`is game paused?`, paused);
  let pauseTx: ContractTransaction;
  // Write call
  paused ? pauseTx = await contract.unpause() : pauseTx = await contract.pause();
  await waitWithMetrics(pauseTx, hre, 'pause/unpause');
}

task(
  'metrics:createPlanets',
  'creates the planets defined in the darkforest.toml [[planets]] key. Only works when zk checks are enabled (using regular mimc fn)'
)
.addOptionalPositionalParam('address', 'game contract addresss', undefined, types.string)
.setAction(createPlanets);


async function createPlanets(args: { address: string | undefined }, hre: HardhatRuntimeEnvironment) {
  // Don't assert chainId because want to be able to connect to Dark Forest on different networks
  // await hre.run('utils:assertChainId'); 

  console.log(`createPlanets on ${hre.network.name}`);

  const contract = await fetchContract(hre, args.address);

  for (const adminPlanetInfo of hre.adminPlanets) {
    try {
      const location = hre.initializers.DISABLE_ZK_CHECKS
        ? fakeHash(hre.initializers.PLANET_RARITY)(adminPlanetInfo.x, adminPlanetInfo.y).toString()
        : mimcHash(hre.initializers.PLANETHASH_KEY)(
            adminPlanetInfo.x,
            adminPlanetInfo.y
          ).toString();
      const adminPlanetCoords = {
        x: adminPlanetInfo.x,
        y: adminPlanetInfo.y,
      };
      const perlinValue = perlin(adminPlanetCoords, {
        key: hre.initializers.SPACETYPE_KEY,
        scale: hre.initializers.PERLIN_LENGTH_SCALE,
        mirrorX: hre.initializers.PERLIN_MIRROR_X,
        mirrorY: hre.initializers.PERLIN_MIRROR_Y,
        floor: true,
      });

      const createPlanetReceipt = await contract.createPlanet({
        ...adminPlanetInfo,
        location,
        perlin: perlinValue,
      }, {
        gasLimit: 15000000
      }
      );
      await waitWithMetrics(createPlanetReceipt, hre, 'createPlanet');
      if (adminPlanetInfo.revealLocation) {
        const pfArgs = await makeRevealProof(
          adminPlanetInfo.x,
          adminPlanetInfo.y,
          hre.initializers.PLANETHASH_KEY,
          hre.initializers.SPACETYPE_KEY,
          hre.initializers.PERLIN_LENGTH_SCALE,
          hre.initializers.PERLIN_MIRROR_X,
          hre.initializers.PERLIN_MIRROR_Y,
          hre.initializers.DISABLE_ZK_CHECKS,
          hre.initializers.PLANET_RARITY
        );
        const revealPlanetReceipt = await contract.revealLocation(...pfArgs, {
          gasLimit: 15000000
        });
        await waitWithMetrics(revealPlanetReceipt, hre, 'revealPlanet');
      }
      console.log(`created admin planet at (${adminPlanetInfo.x}, ${adminPlanetInfo.y})`);
    } catch (e) {
      console.log(`error creating planet at (${adminPlanetInfo.x}, ${adminPlanetInfo.y}):`);
      console.log(e);
    }
  }
}