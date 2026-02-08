// Delegation Save API - saves delegation to Supabase (server-side with service key)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Simple in-memory rate limiter (per IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

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
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

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
