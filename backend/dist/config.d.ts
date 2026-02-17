import { type Address } from 'viem';
export declare const CHAIN_ID = 8453;
export declare const TRADING_API = "https://trade-api.gateway.uniswap.org/v1";
export declare const ALCHEMY_API_KEY: string | undefined;
export declare const ALCHEMY_RPC: string;
export declare const PIMLICO_API_KEY: string | undefined;
export declare const PIMLICO_BUNDLER_URL: string;
export declare const PIMLICO_PAYMASTER_URL: string;
export declare const ADDRESSES: {
    readonly ETH: Address;
    readonly WETH: Address;
    readonly USDC: Address;
    readonly cbBTC: Address;
    readonly UNISWAP_ROUTER: Address;
    readonly PERMIT2: Address;
    readonly DELEGATION_MANAGER: Address;
    readonly EMBER_STAKING: Address;
};
export declare const UNISWAP_ROUTERS: readonly ["0x6fF5693b99212Da76ad316178A184AB56D299b43", "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B"];
export declare const FEE_BPS = 20;
export declare const BPS_DENOMINATOR = 10000;
export declare const SLIPPAGE_SMALL_BPS = 50;
export declare const SLIPPAGE_LARGE_BPS = 30;
export declare const SLIPPAGE_THRESHOLD_USD = 100;
export declare const FG_THRESHOLDS: {
    EXTREME_FEAR_MAX: number;
    FEAR_MAX: number;
    NEUTRAL_MAX: number;
    GREED_MAX: number;
};
export declare const MIN_DELEGATION_VALUE_USD = 10;
export declare const QUOTE_VALIDITY_MS = 30000;
export declare const MAX_QUOTES_PER_CYCLE = 100;
export declare const MIN_WALLET_VALUE_USD = 5;
export declare const OPTIMAL_BATCH_SIZE = 50;
export declare const BATCH_DELAY_MS = 500;
export interface DCADecision {
    action: 'buy' | 'sell' | 'hold';
    percentage: number;
    reason: string;
}
export interface DelegationRecord {
    id: string;
    user_address: string;
    smart_account_address: string;
    delegation_hash: string;
    delegation_signature: string;
    delegation_data: string;
    max_amount_per_swap: string;
    expires_at: string;
    created_at: string;
    target_asset?: string;
}
export interface ExecutionResult {
    success: boolean;
    txHash: string | null;
    error: string | null;
    errorType: ErrorType | null;
    amountIn: string;
    amountOut: string;
    feeCollected: string;
    retryCount: number;
    lastError: string | null;
    walletAddress?: string;
    errorDetail?: string | null;
}
export interface SimulationResult {
    wallet: string;
    totalValueUsd: string;
    balance: string;
    amountToSwap: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    reason?: string;
}
export interface WalletData {
    delegation: DelegationRecord;
    smartAccountAddress: Address;
    balance: bigint;
    swapAmount: bigint;
    swapAmountAfterFee: bigint;
    fee: bigint;
}
export type ErrorType = 'network' | 'revert' | 'timeout' | 'rate_limit' | 'quote_expired' | 'unknown';
export interface ClassifiedError {
    type: ErrorType;
    message: string;
    originalError: unknown;
    retryable: boolean;
}
export interface CaveatValidation {
    valid: boolean;
    reason?: string;
    expiresAt?: number;
    usesRemaining?: number;
}
export interface QuoteWithTimestamp {
    quote: any;
    swap: any;
    timestamp: number;
}
export interface ApprovalTask {
    delegation: DelegationRecord;
    smartAccountAddress: Address;
    needsERC20: boolean;
    needsPermit2: boolean;
}
export interface ApprovalResult {
    wallet: string;
    success: boolean;
    erc20TxHash: string | null;
    permit2TxHash: string | null;
    error?: string;
}
export interface UserOpBatchItem {
    id: number;
    walletData: WalletData;
    swapQuote: {
        swap: any;
        quote: any;
    };
    userOp: any;
}
export interface BatchSendResult {
    success: boolean;
    userOpHash: string | null;
    error: string | null;
    walletAddress: string;
}
export interface PreparedSwap {
    walletData: WalletData;
    swapQuote: {
        swap: any;
        quote: any;
    };
    nonceKey: bigint;
}
export interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    operation: string;
}
export declare const DEFAULT_RETRY_CONFIG: RetryConfig;
export declare const DB_RETRY_CONFIG: Partial<RetryConfig>;
export declare const ERROR_SELECTORS: Record<string, string>;
export declare const CAVEAT_ENFORCERS: Record<string, string>;
export declare const delegationManagerAbi: readonly [{
    readonly name: "redeemDelegations";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "delegations";
        readonly type: "bytes[][]";
    }, {
        readonly name: "modes";
        readonly type: "uint8[]";
    }, {
        readonly name: "executions";
        readonly type: "bytes[][]";
    }];
    readonly outputs: readonly [];
}];
export declare const emberStakingAbi: readonly [{
    readonly name: "depositRewards";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}];
export declare const permit2Abi: readonly [{
    readonly name: "allowance";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amount";
        readonly type: "uint160";
    }, {
        readonly name: "expiration";
        readonly type: "uint48";
    }, {
        readonly name: "nonce";
        readonly type: "uint48";
    }];
}, {
    readonly name: "approve";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint160";
    }, {
        readonly name: "expiration";
        readonly type: "uint48";
    }];
    readonly outputs: readonly [];
}];
export declare function sleep(ms: number): Promise<void>;
/**
 * Validates that a swap target is a known Uniswap router
 */
export declare function isValidUniswapRouter(routerAddress: string): boolean;
/**
 * Validates swap quote and rejects if router is not in whitelist
 */
export declare function validateSwapQuote(swapQuote: {
    swap: {
        to: string;
    };
}): void;
export declare function calculateFee(amount: bigint): bigint;
export declare function calculateAmountAfterFee(amount: bigint): bigint;
/**
 * Calculate the USD value of a swap amount
 */
export declare function calculateSwapValueUsd(amount: bigint, isBuy: boolean, ethPriceUsd: number): number;
/**
 * Get the appropriate slippage tolerance in basis points based on swap size
 */
export declare function getSlippageBpsForSwap(swapValueUsd: number): number;
/**
 * Calculate minimum output amount with slippage protection
 */
export declare function calculateMinAmountOut(expectedOutput: bigint, slippageBps: number): bigint;
export declare function isPermanentFailure(errorMessage: string): boolean;
export declare const MIN_SWAP_AMOUNT: bigint;
