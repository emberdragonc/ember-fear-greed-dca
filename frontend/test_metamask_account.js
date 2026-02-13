// Check what methods are available on MetaMask smart account
import { toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit';

console.log('MetaMask Smart Account methods:');
console.log('- Has sendTransaction?', typeof toMetaMaskSmartAccount === 'function');
console.log('\nNeed to check account object methods after creation');
