// Delegation Save API - saves delegation to Supabase (server-side with service key)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy-loaded Supabase client with service key
let _supabase: any = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return _supabase;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userAddress,
      smartAccountAddress,
      delegationHash, 
      signature, 
      delegationData,
      maxAmountPerSwap,
      expiresAt 
    } = body;

    // Validate inputs
    if (!userAddress || !delegationHash || !signature || !delegationData || !expiresAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Save to database with proper columns
    const { error } = await getSupabase()
      .from('delegations')
      .upsert({
        user_address: userAddress.toLowerCase(),
        smart_account_address: smartAccountAddress?.toLowerCase() || null,
        delegation_hash: delegationHash,
        delegation_signature: signature,
        delegation_data: delegationData,
        max_amount_per_swap: maxAmountPerSwap || '1000000000', // Default 1000 USDC
        expires_at: expiresAt,
      }, {
        onConflict: 'user_address',
      });

    if (error) {
      console.error('Failed to save delegation:', error);
      return NextResponse.json(
        { error: 'Failed to save delegation: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Delegation saved successfully',
    });

  } catch (error) {
    console.error('Delegation save error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save delegation' },
      { status: 500 }
    );
  }
}

// DELETE - remove delegation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing userAddress parameter' },
        { status: 400 }
      );
    }

    const { error } = await getSupabase()
      .from('delegations')
      .delete()
      .eq('user_address', userAddress.toLowerCase());

    if (error) {
      console.error('Failed to delete delegation:', error);
      return NextResponse.json(
        { error: 'Failed to delete delegation: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Delegation deleted successfully',
    });

  } catch (error) {
    console.error('Delegation delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete delegation' },
      { status: 500 }
    );
  }
}

// GET - check if delegation exists
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing userAddress parameter' },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabase()
      .from('delegations')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ 
      exists: true,
      expiresAt: data.expires_at,
    });

  } catch (error) {
    console.error('Delegation check error:', error);
    return NextResponse.json({ exists: false });
  }
}
