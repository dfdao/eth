import { ContractTransaction } from 'ethers';
import { subtask, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

subtask('utils:assertChainId', 'Assert proper network is selectaed').setAction(assertChainId);

async function assertChainId({}, hre: HardhatRuntimeEnvironment) {
  const { NETWORK_ID } = hre.contracts;

  if (hre.network.config.chainId !== NETWORK_ID) {
    throw new Error(
      `Hardhat defined network chain id ${hre.network.config.chainId} is NOT same as contracts network id: ${NETWORK_ID}.`
    );
  }
}

subtask('utils:logRevertReason', 'log reason for tx revert')
.addPositionalParam('txHash', 'hash of reverted tx', undefined, types.string)
.setAction(logRevertReason);

async function logRevertReason(args: {txHash: string}, hre: HardhatRuntimeEnvironment) {
    const errTx = await hre.ethers.provider.getTransaction(args.txHash);
    try {
      //@ts-expect-error
      await ethers.provider.call(errTx)
    } catch (err) {
      // @ts-expect-error
      console.log(err.error.message)
    }
}





