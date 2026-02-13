import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const smartAccountAddress = '0x4F38DDE0bE7d92ABDE9F3D4ba29a92E02bD71Bd7';

const code = await publicClient.getCode({ address: smartAccountAddress });
const ethBalance = await publicClient.getBalance({ address: smartAccountAddress });

console.log('Smart Account:', smartAccountAddress);
console.log('Deployed:', code && code !== '0x');
console.log('Code length:', code?.length || 0);
console.log('ETH Balance:', ethBalance.toString(), 'wei');
