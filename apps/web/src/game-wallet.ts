import {BrowserProvider,getAddress,type Eip1193Provider} from 'ethers';
import {TESTNET} from '@last-signal/chain';
import type {ArmoryWallet} from './armory-runtime.ts';
export async function connectGameWallet(injected:Eip1193Provider|undefined,notice:(message:string)=>void=()=>{},interactive=true):Promise<ArmoryWallet>{
 if(!injected)throw Error('Open the game in a browser with your wallet installed. You can still play with the ready squad.');
 const config=await fetch('/api/journey/config',{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
 const legacy=()=>fetch('/api/weapons/config',{cache:'no-store'}).then(response=>response.json());
 const chainId=config?.enabled&&(config.ownedRoster?.enabled||config.equipment?.admission)?31337:Number((await legacy()).collections?.find((item:{status:string})=>item.status==='READY')?.chainId);
 if(![31337,46630].includes(chainId))throw Error('Equipment is unavailable right now. Try again shortly.');
 notice('Check your wallet to connect.');await injected.request({method:interactive?'eth_requestAccounts':'eth_accounts'});
 if(Number(BigInt(await injected.request({method:'eth_chainId'}) as string))!==chainId){
  if(!interactive)throw Error('Connect your wallet to continue');
  notice('Approve the game connection in your wallet.');
  try{await injected.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+chainId.toString(16)}]});}catch(error){
   if(Number((error as {code?:number}).code)!==4902)throw error;
   if(chainId===31337){const rpc=config?.network?.rpc;if(typeof rpc!=='string')throw Error('Start the latest game session to connect your wallet automatically');const url=new URL(rpc);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('The game connection is unavailable');await injected.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'LAST SIGNAL Demo',rpcUrls:[rpc],nativeCurrency:{name:'Demo Ether',symbol:'ETH',decimals:18}}]});}
   else await injected.request({method:'wallet_addEthereumChain',params:[{chainId:TESTNET.hexChainId,chainName:TESTNET.name,rpcUrls:[TESTNET.rpc],blockExplorerUrls:[TESTNET.explorer],nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18}}]});
  }
 }
 if(Number(BigInt(await injected.request({method:'eth_chainId'}) as string))!==chainId){if(!interactive)throw Error('Connect your wallet to continue');await injected.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+chainId.toString(16)}]});}
 const provider=new BrowserProvider(injected),accounts=await provider.send('eth_accounts',[]) as string[];if(!accounts.length)throw Error('Connect your wallet to continue');const address=getAddress(accounts[0]);
 const unchanged=async()=>{const current=await provider.send('eth_accounts',[]) as string[];if(!current.length||getAddress(current[0])!==address||Number(BigInt(await provider.send('eth_chainId',[])))!==chainId)throw Error('Your wallet changed. Connect again.');};
 let saved:{address:string;session:string;expires:number}|null=null;try{saved=JSON.parse(sessionStorage.getItem('last-signal-testnet-auth')??'null');}catch{}
 if(saved?.session&&saved.expires>Date.now()&&getAddress(saved.address)===address){const response=await fetch('/api/testnet/session',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+saved.session},body:'{}'}).catch(()=>null);if(response?.ok){const identity=await response.json();if(getAddress(identity.address)===address){await unchanged();notice('Wallet connected.');return {provider,address,session:saved.session,expires:saved.expires,chainId};}}}
 if(!interactive)throw Error('Connect your wallet to continue');
 const post=async(path:string,body:unknown)=>{const response=await fetch('/api/testnet/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error('Wallet connection could not finish. Please try again.');return response.json();};
 notice('Confirm that this wallet is yours. This does not buy anything.');const challenge=await post('challenge',{address,chainId}),login=await post('login',{nonce:challenge.nonce,signature:await(await provider.getSigner(address)).signMessage(challenge.message)});await unchanged();if(getAddress(login.address)!==address||typeof login.session!=='string'||login.expires<=Date.now())throw Error('Wallet connection changed. Please connect again.');sessionStorage.setItem('last-signal-testnet-auth',JSON.stringify(login));notice('Wallet connected.');return {provider,address,session:login.session,expires:login.expires,chainId};
}
