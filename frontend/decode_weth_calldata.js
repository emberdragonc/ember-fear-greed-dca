import { decodeAbiParameters, parseAbiParameters } from 'viem';

const callData = '0x5c1c6dcd0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e3c938c71273bfff7dee21bdd3a8ee1e453bdd1b00000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000';

// Skip function selector (first 4 bytes = 8 hex chars after 0x)
const params = '0x' + callData.slice(10);

try {
  // Try to decode as (bytes) - single parameter
  const decoded = decodeAbiParameters(
    parseAbiParameters('bytes'),
    params
  );
  console.log('Decoded outer bytes:', decoded[0]);
  
  // Now decode the inner execution data
  const innerData = decoded[0];
  const innerDecoded = decodeAbiParameters(
    parseAbiParameters('address target, uint256 value, bytes data'),
    innerData
  );
  
  console.log('\nInner execution:');
  console.log('Target:', innerDecoded[0]);
  console.log('Value:', innerDecoded[1].toString());
  console.log('Data:', innerDecoded[2]);
  
  console.log('\n🚨 TARGET IS EOA, NOT WETH CONTRACT!');
  console.log('This is trying to send native ETH, not call WETH.transfer()');
} catch (e) {
  console.error('Decode failed:', e.message);
}
