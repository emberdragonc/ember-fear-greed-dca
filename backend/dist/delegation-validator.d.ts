import { type CaveatValidation, type DelegationRecord } from './config';
export declare function validateDelegationCaveats(delegationData: any): CaveatValidation;
export declare function getActiveDelegations(targetWallet?: string): Promise<DelegationRecord[]>;
