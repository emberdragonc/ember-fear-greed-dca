import { type DCADecision, type ExecutionResult } from './config';
import { type ClassifiedError } from './error-handler';
export declare function logExecution(delegationId: string, userAddress: string, fgValue: number, decision: DCADecision, result: ExecutionResult, isRetry?: boolean): Promise<void>;
export declare function logFailedAttempt(delegationId: string, userAddress: string, stage: string, errorInfo: ClassifiedError, context: Record<string, unknown>): Promise<void>;
export declare function updateProtocolStats(volume: bigint, fees: bigint): Promise<void>;
