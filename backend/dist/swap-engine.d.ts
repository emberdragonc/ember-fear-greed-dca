import { type Address, type Hex } from 'viem';
import { type DelegationRecord, type DCADecision, type ExecutionResult, type SimulationResult, type WalletData, type UserOpBatchItem, type BatchSendResult } from './config';
import { type ClassifiedError } from './error-handler';
/**
 * Get the target token address based on user's preference
 * cbBTC uses 8 decimals (not 18 like WETH/ETH)
 */
export declare function getTargetTokenAddress(targetAsset?: string): Address;
/**
 * Get token decimals for the target asset
 * cbBTC uses 8 decimals, everything else uses 18
 */
export declare function getTargetTokenDecimals(targetAsset?: string): number;
/**
 * Get the token symbol for display
 */
export declare function getTargetTokenSymbol(targetAsset?: string): string;
export declare function getCachedEthPrice(): number | null;
export declare function getETHPriceFromUniswap(): Promise<number>;
export declare function runDryRunSimulation(delegations: DelegationRecord[], decision: DCADecision): Promise<SimulationResult[]>;
export declare function getSwapQuote(swapper: Address, tokenIn: Address, tokenOut: Address, amount: string, slippageToleranceBps?: number): Promise<{
    quote: any;
    swap: any;
    timestamp: number;
    retryInfo: {
        attempts: number;
        lastError: string | null;
    };
} | null>;
export declare function executeDelegatedSwapWithRetry(delegation: DelegationRecord, direction: 'buy' | 'sell', swapTo: Address, swapData: Hex, swapValue: bigint, nonceKey: bigint): Promise<{
    txHash: string | null;
    retryInfo: {
        attempts: number;
        lastError: ClassifiedError | null;
    };
}>;
export declare function executeDelegatedSwap(delegation: DelegationRecord, direction: 'buy' | 'sell', swapTo: Address, swapData: Hex, swapValue: bigint): Promise<{
    txHash: string | null;
    retryInfo: {
        attempts: number;
        lastError: ClassifiedError | null;
    };
}>;
export declare function sendBatchedUserOps(batchItems: UserOpBatchItem[], backendSmartAccount: any): Promise<BatchSendResult[]>;
export declare function waitForBatchedUserOpReceipts(results: BatchSendResult[]): Promise<Map<string, {
    success: boolean;
    txHash: string | null;
    error: string | null;
}>>;
export interface PrepareSwapError {
    stage: 'quote_fetch' | 'quote_validation';
    reason: string;
    apiError?: string;
    tokenPair: string;
    walletAddress: string;
}
export interface BuildUserOpError {
    stage: 'delegation_parse' | 'execution_create' | 'calldata_encode' | 'userop_prepare';
    reason: string;
    originalError?: string;
    tokenPair: string;
    walletAddress: string;
}
export declare function processSwapsParallel(delegations: DelegationRecord[], decision: DCADecision, fgValue: number): Promise<{
    results: ExecutionResult[];
    walletDataMap: Map<string, WalletData>;
}>;
export declare function retrySwapWithOriginalAmounts(walletData: WalletData, decision: DCADecision, fgValue: number): Promise<ExecutionResult>;
export declare function processUserDCA(delegation: DelegationRecord, decision: DCADecision, fgValue: number): Promise<ExecutionResult>;
