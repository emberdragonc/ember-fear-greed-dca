import { type Address } from "viem";
export type WrapMessageHashParams = {
    accountAddress: Address;
    chainId: number;
};
export declare const wrapMessageHash: (messageHash: `0x${string}`, { accountAddress, chainId }: WrapMessageHashParams) => `0x${string}`;
//# sourceMappingURL=wrapMessageHash.d.ts.map