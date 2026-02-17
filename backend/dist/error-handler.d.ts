import { type ClassifiedError, type ErrorType, type RetryConfig } from './config';
export { type ClassifiedError, type ErrorType };
export declare function classifyError(error: unknown): ClassifiedError;
export declare function decodeErrorSelector(errorData: string): string;
export declare function withRetry<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<{
    result: T | null;
    error: ClassifiedError | null;
    attempts: number;
}>;
