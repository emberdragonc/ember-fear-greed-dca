import { keccak256, toHex } from 'viem';

// Common smart account functions
const functions = [
  'execute(address,uint256,bytes)',
  'executeBatch(address[],uint256[],bytes[])',
  'executeBatch(address[],bytes[])',
  'executeBatch((address,uint256,bytes)[])',
  'executeUserOp(address,uint256,bytes,uint8)',
];

functions.forEach(sig => {
  const hash = keccak256(toHex(sig));
  const selector = hash.slice(0, 10);
  console.log(`${sig} -> ${selector}`);
});

console.log('\nTarget selector: 0x5c1c6dcd');
