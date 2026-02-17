// ============ SHARED CLIENTS ============
// Centralized client instances to avoid circular dependencies
import { createPublicClient, createWalletClient, http, erc20Abi, } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { ALCHEMY_RPC, PIMLICO_BUNDLER_URL, PIMLICO_PAYMASTER_URL, ADDRESSES } from './config';
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
export const publicClient = createPublicClient({
    chain: base,
    transport: http(ALCHEMY_RPC),
});
export const backendAccount = privateKeyToAccount((process.env.DCA_BACKEND_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY));
export const walletClient = createWalletClient({
    account: backendAccount,
    chain: base,
    transport: http(ALCHEMY_RPC),
});
// Bundler client for ERC-4337 UserOperations
export const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(PIMLICO_BUNDLER_URL),
});
// Pimlico paymaster client for gas sponsorship
export const pimlicoPaymasterClient = createPimlicoClient({
    transport: http(PIMLICO_PAYMASTER_URL),
});
// ============ BALANCE FETCHING ============
export async function getETHBalance(address) {
    return publicClient.getBalance({ address });
}
export async function getUSDCBalance(address) {
    const balance = await publicClient.readContract({
        address: ADDRESSES.USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
    });
    return balance;
}
export async function getCBBTCBalance(address) {
    const balance = await publicClient.readContract({
        address: ADDRESSES.cbBTC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
    });
    return balance;
}
// ============ ALLOWANCE CHECKING ============
import { permit2Abi } from './config';
export async function getTokenAllowance(token, owner, spender) {
    const allowance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender],
    });
    return allowance;
}
export async function getPermit2Allowance(owner, token, spender) {
    const result = await publicClient.readContract({
        address: ADDRESSES.PERMIT2,
        abi: permit2Abi,
        functionName: 'allowance',
        args: [owner, token, spender],
    });
    return {
        amount: BigInt(result[0]),
        expiration: Number(result[1]),
    };
}
