// Supabase client for balance history
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

export interface BalanceHistoryEntry {
  id: string;
  user_address: string;
  eth_balance: string;
  usdc_balance: string;
  total_usd: number;
  eth_price: number;
  recorded_at: string;
}

export async function getBalanceHistory(userAddress: string, limit = 30): Promise<BalanceHistoryEntry[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('balance_history')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching balance history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error initializing Supabase:', error);
    return [];
  }
}
