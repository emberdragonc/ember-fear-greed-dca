const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

const client = createPublicClient({
  chain: base,
  transport: http(),
});

const WETH = '0x4200000000000000000000000000000000000006';
const smartAccount = '0x4f38dde0be7d92abde9f3d4ba29a92e02bd71bd7';

async function check() {
  const balance = await client.readContract({
    address: WETH,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [smartAccount],
  });
  console.log(`WETH balance: ${formatUnits(balance, 18)}`);
}

check().catch(console.error);