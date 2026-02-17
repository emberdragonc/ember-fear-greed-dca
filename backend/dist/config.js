// ============ CONFIG ============
// Constants, types, and environment variable loading
export const CHAIN_ID = 8453;
export const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';
// Alchemy RPC for reliable read operations (balance checks, quote fetching)
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
export const ALCHEMY_RPC = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
// Pimlico bundler for ERC-4337 UserOperations
export const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
export const PIMLICO_BUNDLER_URL = `https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`;
// Pimlico paymaster for gas sponsorship (fixes AA21 didn't pay prefund)
export const PIMLICO_PAYMASTER_URL = `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`;
export const ADDRESSES = {
    // Tokens
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    // Uniswap V4 Universal Router (used by Trading API)
    UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
    // Permit2 - Universal Router uses this for token transfers
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    // MetaMask Delegation
    DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    // EMBER Staking (fee recipient)
    EMBER_STAKING: '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9',
};
// ============ UNISWAP ROUTER WHITELIST (H5 Fix) ============
// Whitelist of known Uniswap router addresses on Base
// Prevents executing swaps to malicious contracts if API is compromised
export const UNISWAP_ROUTERS = [
    '0x6fF5693b99212Da76ad316178A184AB56D299b43', // Universal Router v1.0
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router v1.2
    '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B', // Universal Router (older)
];
// Fee: 20 basis points = 0.20%
export const FEE_BPS = 20;
export const BPS_DENOMINATOR = 10000;
// ============ MEV PROTECTION - SLIPPAGE CONFIGURATION ============
// C4/M4 Fix: Dynamic slippage based on swap size to prevent sandwich attacks
export const SLIPPAGE_SMALL_BPS = 50; // 0.5% for swaps < $100
export const SLIPPAGE_LARGE_BPS = 30; // 0.3% for swaps >= $100
export const SLIPPAGE_THRESHOLD_USD = 100; // $100 threshold
// F&G Thresholds
export const FG_THRESHOLDS = {
    EXTREME_FEAR_MAX: 25,
    FEAR_MAX: 45,
    NEUTRAL_MAX: 54,
    GREED_MAX: 75,
};
// ============ ECONOMIC AUDIT FIXES ============
// 1. Minimum Delegation Value ($10) - Griefing protection
export const MIN_DELEGATION_VALUE_USD = 10; // Skip wallets with value below $10
// 2. Quote Expiration Check - Stale quote protection
export const QUOTE_VALIDITY_MS = 30000; // 30 seconds quote validity
// 3. Rate Limiting on Quote API - Resource exhaustion protection
export const MAX_QUOTES_PER_CYCLE = 100;
export const MIN_WALLET_VALUE_USD = 5; // Minimum total wallet value for simulation
// Batch processing configuration
export const OPTIMAL_BATCH_SIZE = 50;
export const BATCH_DELAY_MS = 500;
export const DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    operation: 'unknown',
};
// H3 Fix: Retry configuration for DB operations
export const DB_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    operation: 'database',
};
// ============ ERROR SELECTORS & CAVEAT VALIDATION ============
// Known error selectors for better debugging
export const ERROR_SELECTORS = {
    '0xd81b2f2e': 'CaveatViolated - A delegation caveat enforcement failed',
    '0x155ff427': 'DelegationNotFound - Delegation hash not registered',
    '0x3a91a018': 'ExecutionFailed - Generic execution failure in DelegationManager',
    '0x00000000': 'GenericRevert - Execution reverted without reason',
    '0x08c379a0': 'Error(string) - Standard revert with message',
    '0x4e487b71': 'Panic - Solidity panic (overflow, division by zero, etc)',
};
// Known caveat enforcers
export const CAVEAT_ENFORCERS = {
    '0x7f20f61b1f09b08d970938f6fa563634d65c4eeb': 'AllowedTokensEnforcer',
    '0x2c21fd0cb9dc8445cb3fb0dc5e7bb0aca01842b5': 'AllowedMethodsEnforcer',
    '0x92bf12322527caa612fd31a0e810472bbb106a8f': 'IdEnforcer',
    '0x1046bb45c8d673d4ea75321280db34899413c069': 'TimestampEnforcer',
    '0x04658b29f6b82ed55274221a06fc97d318e25416': 'LimitedCallsEnforcer',
};
// ============ ABIs ============
export const delegationManagerAbi = [
    {
        name: 'redeemDelegations',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'delegations', type: 'bytes[][]' },
            { name: 'modes', type: 'uint8[]' },
            { name: 'executions', type: 'bytes[][]' },
        ],
        outputs: [],
    },
];
export const emberStakingAbi = [
    {
        name: 'depositRewards',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
];
export const permit2Abi = [
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
        ],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
        ],
        outputs: [],
    },
];
// ============ SHARED HELPERS ============
// Sleep helper for delays
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Validates that a swap target is a known Uniswap router
 */
export function isValidUniswapRouter(routerAddress) {
    const normalizedAddress = routerAddress.toLowerCase();
    return UNISWAP_ROUTERS.some(r => r.toLowerCase() === normalizedAddress);
}
/**
 * Validates swap quote and rejects if router is not in whitelist
 */
export function validateSwapQuote(swapQuote) {
    const routerAddress = swapQuote.swap.to;
    if (!isValidUniswapRouter(routerAddress)) {
        console.error(`[SECURITY] Router whitelist rejection: ${routerAddress}`);
        console.error(`[SECURITY] Allowed routers: ${UNISWAP_ROUTERS.join(', ')}`);
        throw new Error(`Swap rejected: Router ${routerAddress} is not in whitelist. Possible API compromise.`);
    }
}
// Fee calculation
export function calculateFee(amount) {
    return (amount * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR);
}
export function calculateAmountAfterFee(amount) {
    return amount - calculateFee(amount);
}
// ============ MEV PROTECTION - DYNAMIC SLIPPAGE HELPERS ============
import { formatUnits } from 'viem';
/**
 * Calculate the USD value of a swap amount
 */
export function calculateSwapValueUsd(amount, isBuy, ethPriceUsd) {
    if (isBuy) {
        return Number(formatUnits(amount, 6));
    }
    else {
        return Number(formatUnits(amount, 18)) * ethPriceUsd;
    }
}
/**
 * Get the appropriate slippage tolerance in basis points based on swap size
 */
export function getSlippageBpsForSwap(swapValueUsd) {
    if (swapValueUsd < SLIPPAGE_THRESHOLD_USD) {
        return SLIPPAGE_SMALL_BPS;
    }
    return SLIPPAGE_LARGE_BPS;
}
/**
 * Calculate minimum output amount with slippage protection
 */
export function calculateMinAmountOut(expectedOutput, slippageBps) {
    const slippageFactor = BigInt(BPS_DENOMINATOR - slippageBps);
    return (expectedOutput * slippageFactor) / BigInt(BPS_DENOMINATOR);
}
export function isPermanentFailure(errorMessage) {
    const permanentPatterns = [
        'caveatviolated',
        'delegationnotfound',
        'expired',
        'insufficient balance',
        'transfer amount exceeds',
        'invalid delegation',
        'not authorized',
    ];
    const lower = errorMessage.toLowerCase();
    return permanentPatterns.some(p => lower.includes(p));
}
export const MIN_SWAP_AMOUNT = parseUnits('0.10', 6);
import { parseUnits } from 'viem';
