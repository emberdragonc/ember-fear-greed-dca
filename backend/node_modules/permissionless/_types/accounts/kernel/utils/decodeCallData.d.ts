import type { KernelVersion } from "../toKernelSmartAccount.js";
export declare const decodeCallData: ({ kernelVersion, callData }: {
    callData: `0x${string}`;
    kernelVersion: KernelVersion<"0.6" | "0.7">;
}) => readonly {
    to: `0x${string}`;
    value?: bigint | undefined;
    data?: `0x${string}` | undefined;
}[];
//# sourceMappingURL=decodeCallData.d.ts.map