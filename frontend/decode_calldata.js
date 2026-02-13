const { decodeFunctionData, parseAbi } = require('viem');

// The callData from the error
const callData = '0x5c1c6dcd0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e3c938c71273bfff7dee21bdd3a8ee1e453bdd1b00000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000';

// Smart account execute function ABI
const abi = parseAbi([
  'function execute(address target, uint256 value, bytes calldata data)',
]);

try {
  const decoded = decodeFunctionData({
    abi,
    data: callData
  });
  
  console.log('Decoded execute call:');
  console.log('Function:', decoded.functionName);
  console.log('Target:', decoded.args[0]);
  console.log('Value:', decoded.args[1].toString());
  console.log('Data:', decoded.args[2]);
} catch (error) {
  console.error('Failed to decode:', error.message);
}

// Check if target is WETH
const WETH = '0x4200000000000000000000000000000000000006';
console.log('\nWETH address:', WETH);
console.log('Target matches WETH:', decoded.args[0].toLowerCase() === WETH.toLowerCase());