import {getAddress,type BrowserProvider} from 'ethers';

export type ArmoryWallet={provider:BrowserProvider;address:string;session:string;expires:number;chainId:number};
let wallet:ArmoryWallet|null=null,busy=false;
export const currentArmoryWallet=()=>wallet;
export const isArmoryBusy=()=>busy;
export function publishArmoryWallet(value:ArmoryWallet|null){wallet=value;document.dispatchEvent(new CustomEvent('armory:wallet',{detail:value}));}
export function onArmoryWallet(callback:(value:ArmoryWallet|null)=>void){document.addEventListener('armory:wallet',event=>callback((event as CustomEvent<ArmoryWallet|null>).detail));}
export async function armoryAction<T>(work:()=>Promise<T>):Promise<T>{if(busy)throw Error('Finish the current wallet request first.');busy=true;document.dispatchEvent(new Event('armory:busy'));try{return await work();}finally{busy=false;document.dispatchEvent(new Event('armory:busy'));}}
export async function verifyArmoryWallet(chainId:number,address:string){const state=wallet;if(!state||state.expires<=Date.now()||![31337,46630].includes(chainId)||state.chainId!==chainId||getAddress(address)!==state.address)throw Error('Reconnect your wallet before continuing.');const accounts=await state.provider.send('eth_accounts',[]) as string[];if(Number(BigInt(await state.provider.send('eth_chainId',[])))!==chainId||!accounts.length||getAddress(accounts[0])!==state.address)throw Error('Your wallet changed. Connect it again.');}
export function playerMessage(message:string){
 if(/INVALID_ARGUMENT|NUMERIC_FAULT|invalid FixedNumber|underflow|overflow/i.test(message))return 'Enter a valid price using numbers and a decimal point.';
 if(/insufficient funds|InsufficientBalance|INSUFFICIENT_FUNDS/i.test(message))return 'Your wallet needs more test funds to complete this.';
 if(/nonce|StaleTerms|quote changed|listing changed|ownership epoch|build mismatch|deployment.*mismatch|collection.*mismatch/i.test(message))return 'This item or listing changed. Refresh your equipment and choose it again.';
 if(/Connect and sign in|Wallet login required/i.test(message))return 'Connect your wallet to continue.';
 if(/CALL_EXCEPTION|missing revert data|execution reverted|TRANSACTION_REPLACED|NONCE_EXPIRED|REPLACEMENT_UNDERPRICED|ECONNRESET|0x[a-fA-F0-9]{40,}/i.test(message))return 'Your request could not finish. Use Finish pending request or reconnect your wallet before trying again.';
 if(/No (EVM|injected)|No wallet (is available|detected)/i.test(message))return 'Open the Armory in a browser with your wallet installed. You can browse the shop without connecting.';
 if(/code mismatch|identity mismatch|verification failed|not canonically confirmed|Chain unavailable|chain reads unavailable/i.test(message))return 'We could not verify this item or payment. Nothing will be retried automatically. Refresh before trying again.';
 if(/Wrong network|Switch to Robinhood|Select the displayed|configured network|supported testnet/i.test(message))return 'Choose the game’s test network in your wallet, then connect again.';
 if(/ACTION_REJECTED|Wallet request rejected/i.test(message))return 'You cancelled the wallet request. Nothing will be retried automatically.';
 return message.replaceAll('RPC READ','wallet read').replaceAll('canonical confirmations','confirmation').replaceAll('canonically confirmed','confirmed').replaceAll('testnet NFTs','collectible guns').replaceAll('gun NFTs','collectible guns').replaceAll('mock units','tWIF').replaceAll('mock tWIF','test tWIF').replaceAll('No simulated ownership is substituted.','').replaceAll('No simulated wallet balance is substituted.','');
}
