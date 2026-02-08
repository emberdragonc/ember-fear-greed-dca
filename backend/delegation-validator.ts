// ============ DELEGATION VALIDATION ============

import { CAVEAT_ENFORCERS, type CaveatValidation, type DelegationRecord, DB_RETRY_CONFIG } from './config';
import { withRetry } from './error-handler';
import { supabase } from './clients';

export function validateDelegationCaveats(delegationData: any): CaveatValidation {
  const now = Math.floor(Date.now() / 1000);
  const caveats = delegationData.caveats || [];
  
  for (const caveat of caveats) {
    const enforcerAddr = caveat.enforcer?.toLowerCase();
    const enforcerName = CAVEAT_ENFORCERS[enforcerAddr] || 'Unknown';
    
    // Check TimestampEnforcer
    if (enforcerAddr === '0x1046bb45c8d673d4ea75321280db34899413c069') {
      const terms = caveat.terms?.slice(2) || ''; // remove 0x
      if (terms.length >= 64) {
        const validAfter = parseInt(terms.slice(24, 32), 16);
        const validUntil = parseInt(terms.slice(56, 64), 16);
        
        if (now < validAfter) {
          return { 
            valid: false, 
            reason: `Delegation not yet valid (starts ${new Date(validAfter * 1000).toISOString()})` 
          };
        }
        if (now > validUntil) {
          return { 
            valid: false, 
            reason: `Delegation expired (ended ${new Date(validUntil * 1000).toISOString()})`,
            expiresAt: validUntil
          };
        }
        
        // Warn if expiring soon (within 7 days)
        const sevenDays = 7 * 24 * 60 * 60;
        if (validUntil - now < sevenDays) {
          console.log(`  ⚠️ Delegation expires soon: ${new Date(validUntil * 1000).toISOString()}`);
        }
      }
    }
    
    // Check LimitedCallsEnforcer
    if (enforcerAddr === '0x04658b29f6b82ed55274221a06fc97d318e25416') {
      const terms = caveat.terms?.slice(2) || '';
      if (terms.length >= 64) {
        const maxCalls = parseInt(terms.slice(0, 64), 16);
        if (maxCalls < 1000) {
          console.log(`  ℹ️ Delegation has ${maxCalls} max calls limit`);
        }
      }
    }
  }
  
  return { valid: true };
}

export async function getActiveDelegations(targetWallet?: string): Promise<DelegationRecord[]> {
  const { result, error } = await withRetry(
    async () => {
      const { data, error } = await supabase
        .from('delegations')
        .select('*')
        .gt('expires_at', new Date().toISOString());
      
      if (error) throw error;
      return data || [];
    },
    { ...DB_RETRY_CONFIG, operation: 'getActiveDelegations' }
  );

  if (error || result === null) {
    console.error('[DB] Failed to fetch delegations after retries:', error?.message);
    return [];
  }
  // Filter to single wallet if --wallet flag provided
  if (targetWallet) {
    const filtered = result.filter((d: DelegationRecord) => 
      d.smart_account_address?.toLowerCase() === targetWallet ||
      d.user_address?.toLowerCase() === targetWallet
    );
    console.log(`[Filter] --wallet flag: ${result.length} → ${filtered.length} delegations`);
    return filtered;
  }
  return result;
}
