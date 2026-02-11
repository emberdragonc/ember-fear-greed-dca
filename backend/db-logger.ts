// ============ DATABASE LOGGING ============

import { DB_RETRY_CONFIG, type DCADecision, type ExecutionResult } from './config';
import { type ClassifiedError, withRetry } from './error-handler';
import { supabase } from './clients';

export async function logExecution(
  delegationId: string,
  userAddress: string,
  fgValue: number,
  decision: DCADecision,
  result: ExecutionResult,
  isRetry: boolean = false
) {
  const { error, attempts } = await withRetry(
    async () => {
      const { error } = await supabase.from('dca_executions').insert({
        user_address: userAddress,
        fear_greed_index: fgValue,
        action: decision.action,
        amount_in: result.amountIn,
        amount_out: result.amountOut,
        fee_collected: result.feeCollected,
        tx_hash: result.txHash,
        status: result.success ? 'success' : (isRetry ? 'retry_failed' : 'failed'),
        error_message: isRetry ? `[RETRY] ${result.error || ''}` : result.error,
        error_type: result.errorType,
        error_detail: result.errorDetail || result.error, // Store granular error reason for reporting
        retry_count: result.retryCount,
        last_error: result.lastError,
        wallet_address: result.walletAddress,
        created_at: new Date().toISOString(),
      });
      
      if (error) throw error;
    },
    { ...DB_RETRY_CONFIG, operation: 'logExecution' }
  );

  if (error) {
    console.error(`[DB] Failed to log execution after ${attempts} attempts:`, error.message);
    console.error('[DB] Execution details for manual recovery:', JSON.stringify({
      delegationId,
      userAddress,
      fgValue,
      decision,
      result,
    }, (key, value) => typeof value === 'bigint' ? '0x' + value.toString(16) : value, 2));
  }
}

export async function logFailedAttempt(
  delegationId: string,
  userAddress: string,
  stage: string,
  errorInfo: ClassifiedError,
  context: Record<string, unknown>
) {
  console.error(`[FAILED] ${stage} for ${userAddress}:`, {
    errorType: errorInfo.type,
    message: errorInfo.message,
    retryable: errorInfo.retryable,
    context,
  });

  const { error, attempts } = await withRetry(
    async () => {
      const { error } = await supabase.from('dca_failed_attempts').insert({
        delegation_id: delegationId,
        user_address: userAddress,
        stage,
        error_type: errorInfo.type,
        error_message: errorInfo.message,
        retryable: errorInfo.retryable,
        context: JSON.stringify(context, (key, value) =>
          typeof value === 'bigint' ? '0x' + value.toString(16) : value
        ),
        created_at: new Date().toISOString(),
      });
      
      if (error) throw error;
    },
    { ...DB_RETRY_CONFIG, operation: 'logFailedAttempt' }
  );

  if (error) {
    console.error(`[DB] Failed to log failed attempt after ${attempts} attempts:`, error.message);
  }
}

export async function updateProtocolStats(volume: bigint, fees: bigint) {
  const { error, attempts } = await withRetry(
    async () => {
      const { error } = await supabase.rpc('increment_protocol_stats', {
        volume_delta: volume.toString(),
        fees_delta: fees.toString(),
      });
      
      if (error) throw error;
    },
    { ...DB_RETRY_CONFIG, operation: 'updateProtocolStats' }
  );

  if (error) {
    console.error(`[DB] Failed to update protocol stats after ${attempts} attempts:`, error.message);
    console.error('[DB] Stats that failed to update:', { volume: volume.toString(), fees: fees.toString() });
  }
}
