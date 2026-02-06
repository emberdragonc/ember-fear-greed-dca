import type { KernelVersion } from "../toKernelSmartAccount.js";
export declare const encodeCallData: ({ kernelVersion, calls }: {
    calls: readonly {
        to: `0x${string}`;
        value?: bigint | undefined;
        data?: `0x${string}` | undefined;
    }[];
    kernelVersion: KernelVersion<"0.6" | "0.7">;
}) => `0x${string}`;
//# sourceMappingURL=encodeCallData.d.ts.map