const { createPublicClient, http, encodeFunctionData, parseEther } = require('viem');
const { base } = require('viem/chains');

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4'),
});

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const smartAccount = '0x4f38dde0be7d92abde9f3d4ba29a92e02bd71bd7'; // Your smart account
const testRecipient = '0xE3c938c71273bFFf7DEe21BDD3a8ee1e453Bdd1b'; // Your EOA

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

async function simulateWethTransfer() {
  console.log('Testing WETH transfer simulation...');
  
  // Check WETH balance first
  const balance = await client.readContract({
    address: WETH_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [smartAccount],
  });
  
  console.log(`WETH balance: ${balance.toString()}`);
  
  if (balance === 0n) {
    console.log('❌ No WETH balance to transfer');
    return;
  }
  
  // Test transfer of 0.01 WETH
  const transferAmount = parseEther('0.01');
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [testRecipient, transferAmount],
  });
  
  // Simulate via Alchemy
  try {
    const response = await fetch('https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_simulateAssetChanges',
        params: [{
          from: smartAccount,
          to: WETH_ADDRESS,
          data: transferData
        }]
      })
    });
    
    const result = await response.json();
    console.log('Simulation result:', JSON.stringify(result, null, 2));
    
    if (result.error) {
      console.log('❌ Simulation failed:', result.error.message);
    } else {
      console.log('✅ Simulation passed');
    }
  } catch (error) {
    console.error('❌ Simulation error:', error);
  }
}

simulateWethTransfer().catch(console.error);