import { type Address } from "viem";
import type { KernelVersion } from "../toKernelSmartAccount.js";
export type WrapMessageHashParams = {
    kernelVersion: KernelVersion<"0.6" | "0.7">;
    accountAddress: Address;
    chainId: number;
};
export declare const wrapMessageHash: (messageHash: `0x${string}`, { accountAddress, kernelVersion, chainId }: WrapMessageHashParams) => `0x${string}`;
//# sourceMappingURL=wrapMessageHash.d.ts.map