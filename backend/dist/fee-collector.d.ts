import { type Address } from 'viem';
import { type DelegationRecord } from './config';
export declare function collectFee(delegation: DelegationRecord, tokenAddress: Address, amount: bigint): Promise<string | null>;
