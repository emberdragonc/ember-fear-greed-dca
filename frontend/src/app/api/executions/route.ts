// Executions API - fetch DCA execution history for a user
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy-loaded Supabase client
let _supabase: any = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase credentials not found');
    }
    
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'userAddress is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Fetch executions for this user, ordered by most recent first
    // Note: error_message column may not exist yet - query without it for now
    const { data: executions, error } = await supabase
      .from('dca_executions')
      .select('id, user_address, fear_greed_index, action, amount_in, amount_out, fee_collected, tx_hash, status, created_at')
      .eq('user_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch executions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch executions' },
        { status: 500 }
      );
    }

    // Transform the data to match frontend expectations
    const transformedExecutions = (executions || []).map((exec: any) => ({
      id: exec.id,
      timestamp: exec.created_at,
      action: exec.action,
      amount_in: exec.amount_in,
      amount_out: exec.amount_out,
      fear_greed_index: exec.fear_greed_index,
      tx_hash: exec.tx_hash,
      status: exec.status,
      error_message: exec.error_message || null,
    }));

    return NextResponse.json({ executions: transformedExecutions });
  } catch (error) {
    console.error('Executions API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
