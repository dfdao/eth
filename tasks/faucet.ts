import { DFArenaFaucet } from '@darkforest_eth/contracts/typechain';
import * as fs from 'fs';
import { subtask, task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { generateKey, generateKeys, keysPerTx } from './whitelist-helpers';

task('faucet:deploy', 'change the faucet amount players')
  .addPositionalParam('value', 'amount to fund faucet with', undefined, types.float)
  .setAction(deployFaucet);

async function deployFaucet(args: { value: number }, hre: HardhatRuntimeEnvironment) {
  await hre.run('utils:assertChainId');

  const contract = await hre.ethers.getContractAt('DFArenaFaucet', hre.contracts.CONTRACT_ADDRESS);

  const txReceipt = await contract.changeDrip(hre.ethers.utils.parseEther(args.value.toString()));
  await txReceipt.wait();

  console.log(`changed drip to ${args.value}`);
}



task('faucet:changeDrip', 'change the faucet amount players')
  .addPositionalParam('value', 'drip value (in ether or xDAI)', undefined, types.float)
  .setAction(changeDrip);

async function changeDrip(args: { value: number }, hre: HardhatRuntimeEnvironment) {
  await hre.run('utils:assertChainId');

  const contract = await hre.ethers.getContractAt('DFArenaFaucet', hre.contracts.CONTRACT_ADDRESS);

  const txReceipt = await contract.changeDrip(hre.ethers.utils.parseEther(args.value.toString()));
  await txReceipt.wait();

  console.log(`changed drip to ${args.value}`);
}




