import { type Address } from 'viem';
import { Implementation } from '@metamask/smart-accounts-kit';
import type { DelegationRecord } from './config';
export declare function initBackendSmartAccount(): Promise<import("@metamask/smart-accounts-kit").ToMetaMaskSmartAccountReturnType<Implementation>>;
export declare function ensureUserSmartAccountDeployed(smartAccountAddress: Address, userEOA: Address): Promise<boolean>;
export declare function deployUndeployedAccounts(delegations: DelegationRecord[]): Promise<void>;
