// Check if paymaster policy allows WETH contract
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

console.log('WETH Address:', WETH_ADDRESS);
console.log('USDC Address:', USDC_ADDRESS);
console.log('\nWETH is canonical Base WETH (predeployed)');
console.log('USDC is normal ERC20 contract');
console.log('\nIf paymaster policy has Contract Restrictions OFF, both should work.');
console.log('Need to check Pimlico dashboard for policy sp_glamorous_leopardon');
