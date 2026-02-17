#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
from datetime import datetime, timezone

os.chdir('/home/clawdbot/projects/ember-fear-greed-dca/backend')

# Load env from shell source
import subprocess
result = subprocess.run(['bash', '-c', 'source ~/.config/ember-treasury/.keys && env'], 
                       capture_output=True, text=True)
for line in result.stdout.strip().split('\n'):
    if '=' in line:
        key, val = line.split('=', 1)
        os.environ[key] = val

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

def fetch_fear_greed():
    try:
        req = urllib.request.Request('https://api.alternative.me/fng/')
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return {
                'value': int(data['data'][0]['value']),
                'classification': data['data'][0]['value_classification']
            }
    except Exception as e:
        print(f"Failed to fetch F&G: {e}")
        return None

def calculate_decision(fg_value):
    if fg_value <= 24:
        return {'action': 'buy', 'percentage': 5, 'reason': 'Extreme Fear - Buy 5%'}
    if fg_value <= 44:
        return {'action': 'buy', 'percentage': 2.5, 'reason': 'Fear - Buy 2.5%'}
    if fg_value <= 55:
        return {'action': 'hold', 'percentage': 0, 'reason': 'Neutral - Hold'}
    if fg_value <= 74:
        return {'action': 'sell', 'percentage': 2.5, 'reason': 'Greed - Sell 2.5%'}
    return {'action': 'sell', 'percentage': 5, 'reason': 'Extreme Greed - Sell 5%'}

def supabase_query(table, method='GET', data=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    
    if method == 'GET':
        req = urllib.request.Request(url, headers=headers)
    else:
        req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"Supabase error: {e}")
        return None

def get_active_delegations():
    url = f"{SUPABASE_URL}/rest/v1/delegations?limit=1000"
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Accept': 'application/json'}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"Failed to fetch delegations: {e}")
        return []

def has_already_executed_today():
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    url = f"{SUPABASE_URL}/rest/v1/dca_executions?select=id&created_at=gte.{today}T00:00:00&limit=1"
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Accept': 'application/json'}
    req = urllib.request.Request(url.replace(' ', '%20'), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return len(data) > 0
    except Exception as e:
        print(f"Idempotency check error: {e}")
        return True  # Fail closed

def main():
    print("=" * 40)
    print("  Fear & Greed DCA Executor (Python)")
    print("=" * 40)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    
    # Check if already ran today
    if has_already_executed_today():
        print("\n⚠️  Already executed today. Skipping.")
        return
    
    # Fetch F&G
    fg = fetch_fear_greed()
    if not fg:
        print("\n❌ Could not fetch Fear & Greed index")
        return
    
    print(f"\nFear & Greed: {fg['value']} ({fg['classification']})")
    
    decision = calculate_decision(fg['value'])
    print(f"Decision: {decision['reason']}")
    
    if decision['action'] == 'hold':
        print("\n✓ Market neutral - No action needed")
        # Log the execution
        data = {
            'user_address': 'SYSTEM',
            'fear_greed_index': fg['value'],
            'action': decision['action'],
            'amount_in': '0',
            'amount_out': '0',
            'status': 'hold'
        }
        url = f"{SUPABASE_URL}/rest/v1/dca_executions"
        headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
        req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method='POST')
        try:
            urllib.request.urlopen(req, timeout=30)
        except:
            pass
        return
    
    # Get delegations
    delegations = get_active_delegations()
    print(f"\nActive delegations: {len(delegations)}")
    
    if len(delegations) == 0:
        print("No active delegations to process")
        return
    
    # Filter valid delegations
    EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.lower()
    valid_delegations = []
    for d in delegations:
        try:
            dd = d['delegation_data']
            if isinstance(dd, str):
                dd = json.loads(dd)
            delegate = dd.get('delegate', '').lower()
            if delegate == EXPECTED_DELEGATE:
                valid_delegations.append(d)
        except:
            pass
    
    print(f"Valid delegations: {len(valid_delegations)}")
    
    if len(valid_delegations) == 0:
        print("No valid delegations to process")
        return
    
    print("\n📊 Summary:")
    print(f"   - Fear & Greed: {fg['value']} ({fg['classification']})")
    print(f"   - Decision: {decision['reason']}")
    print(f"   - Wallets to process: {len(valid_delegations)}")
    
    # Log execution
    data = {
        'user_address': 'SYSTEM',
        'fear_greed_index': fg['value'],
        'action': decision['action'],
        'amount_in': '0',
        'amount_out': '0',
        'status': 'resource_limited',
        'error_message': f'Lightweight mode - {len(valid_delegations)} wallets pending'
    }
    url = f"{SUPABASE_URL}/rest/v1/dca_executions"
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method='POST')
    try:
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"Failed to log execution: {e}")
    
    print("\n⚠️  NOTE: Full execution requires the complete DCA executor.")
    print("   This lightweight version reports status only due to resource constraints.")
    print("   Please run the full executor on a system with more resources.")

if __name__ == '__main__':
    main()
