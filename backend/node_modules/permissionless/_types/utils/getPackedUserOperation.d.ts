import { type Hex } from "viem";
import type { PackedUserOperation, UserOperation } from "viem/account-abstraction";
export declare function getInitCode(unpackedUserOperation: UserOperation<"0.7">): `0x${string}`;
export declare function unPackInitCode(initCode: Hex): {
    factory: null;
    factoryData: null;
} | {
    factory: `0x${string}`;
    factoryData: `0x${string}`;
};
export declare function getAccountGasLimits(unpackedUserOperation: UserOperation<"0.7">): `0x${string}`;
export declare function unpackAccountGasLimits(accountGasLimits: Hex): {
    verificationGasLimit: bigint;
    callGasLimit: bigint;
};
export declare function getGasLimits(unpackedUserOperation: UserOperation<"0.7">): `0x${string}`;
export declare function unpackGasLimits(gasLimits: Hex): {
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
};
export declare function getPaymasterAndData(unpackedUserOperation: UserOperation<"0.7">): `0x${string}`;
export declare function unpackPaymasterAndData(paymasterAndData: Hex): {
    paymaster: null;
    paymasterVerificationGasLimit: null;
    paymasterPostOpGasLimit: null;
    paymasterData: null;
} | {
    paymaster: `0x${string}`;
    paymasterVerificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint;
    paymasterData: `0x${string}`;
};
export declare const getPackedUserOperation: (userOperation: {
    authorization?: import("viem").SignedAuthorization<number> | undefined;
    callData: `0x${string}`;
    callGasLimit: bigint;
    factory?: `0x${string}` | undefined;
    factoryData?: `0x${string}` | undefined;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    nonce: bigint;
    paymaster?: `0x${string}` | undefined;
    paymasterData?: `0x${string}` | undefined;
    paymasterPostOpGasLimit?: bigint | undefined;
    paymasterVerificationGasLimit?: bigint | undefined;
    preVerificationGas: bigint;
    sender: `0x${string}`;
    signature: `0x${string}`;
    verificationGasLimit: bigint;
}) => PackedUserOperation;
//# sourceMappingURL=getPackedUserOperation.d.ts.map