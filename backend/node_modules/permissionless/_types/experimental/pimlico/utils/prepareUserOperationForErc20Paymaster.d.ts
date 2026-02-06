import { type Chain, type Client, type Transport } from "viem";
import { type PrepareUserOperationParameters, type PrepareUserOperationRequest, type SmartAccount } from "viem/account-abstraction";
export declare const prepareUserOperationForErc20Paymaster: (pimlicoClient: Client, { balanceOverride, balanceSlot: _balanceSlot }?: {
    balanceOverride?: boolean | undefined;
    balanceSlot?: bigint | undefined;
}) => <account extends SmartAccount | undefined, const calls extends readonly unknown[], const request extends PrepareUserOperationRequest<account, accountOverride, calls>, accountOverride extends SmartAccount | undefined = undefined>(client: Client<Transport, Chain | undefined, account>, parameters_: PrepareUserOperationParameters<account, accountOverride, calls, request>) => Promise<import("viem").UnionOmit<request, "calls" | "parameters"> & {
    callData: `0x${string}`;
    paymasterAndData: import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_1 ? T_1 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_1 extends "0.6" ? `0x${string}` : undefined : never : never;
    sender: `0x${string}`;
} & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "authorization"> extends never ? {} : {
    authorization: import("viem").SignedAuthorization<number> | undefined;
}) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "factory"> extends never ? {} : (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_2 ? T_2 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_2 extends "0.9" ? {
    factory: `0x${string}` | undefined;
    factoryData: `0x${string}` | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_3 ? T_3 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_3 extends "0.8" ? {
    factory: `0x${string}` | undefined;
    factoryData: `0x${string}` | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_4 ? T_4 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_4 extends "0.7" ? {
    factory: `0x${string}` | undefined;
    factoryData: `0x${string}` | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_5 ? T_5 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_5 extends "0.6" ? {
    initCode: `0x${string}` | undefined;
} : never : never : never)) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "nonce"> extends never ? {} : {
    nonce: bigint;
}) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "fees"> extends never ? {} : {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "gas"> extends never ? {} : (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_6 ? T_6 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_6 extends "0.9" ? {
    callGasLimit: bigint;
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_7 ? T_7 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_7 extends "0.8" ? {
    callGasLimit: bigint;
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_8 ? T_8 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_8 extends "0.7" ? {
    callGasLimit: bigint;
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_9 ? T_9 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_9 extends "0.6" ? {
    callGasLimit: bigint;
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
} : never : never : never)) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "paymaster"> extends never ? {} : (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_10 ? T_10 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_10 extends "0.9" ? {
    paymaster: `0x${string}` | undefined;
    paymasterData: `0x${string}` | undefined;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_11 ? T_11 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_11 extends "0.8" ? {
    paymaster: `0x${string}` | undefined;
    paymasterData: `0x${string}` | undefined;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_12 ? T_12 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_12 extends "0.7" ? {
    paymaster: `0x${string}` | undefined;
    paymasterData: `0x${string}` | undefined;
    paymasterPostOpGasLimit: bigint | undefined;
    paymasterVerificationGasLimit: bigint | undefined;
} : never : never : never) | (import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> extends infer T_13 ? T_13 extends import("viem/account-abstraction").DeriveEntryPointVersion<import("viem/account-abstraction").DeriveSmartAccount<account, accountOverride>> ? T_13 extends "0.6" ? {
    paymasterAndData: `0x${string}` | undefined;
} : never : never : never)) & (Extract<request["parameters"] extends readonly import("viem/account-abstraction").PrepareUserOperationParameterType[] ? request["parameters"][number] : "authorization" | "factory" | "fees" | "gas" | "nonce" | "paymaster" | "signature", "signature"> extends never ? {} : {
    signature: `0x${string}`;
}) extends infer T ? { [K in keyof T]: T[K]; } : never>;
//# sourceMappingURL=prepareUserOperationForErc20Paymaster.d.ts.map