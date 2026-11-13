import {Contract,Interface,keccak256,Transaction,type JsonRpcProvider,type Signer} from 'ethers';
import vaultAbi from '../../../packages/contracts/abi/SurvivalRunVault.json';
import type {SurvivalResult} from '@last-signal/chain';
import type {SettlementTransport,SettlementAttempt,WorkerReceipt} from './survival-settlements.ts';

export type SurvivalVaultManifest={chain:bigint;vault:string;token:string;treasury:string;signer:string;deployment:string;rulesHash:string;fromBlock:number;vaultCodeHash:string;tokenCodeHash:string;treasuryCodeHash:string};
export type LocalVaultManifest=SurvivalVaultManifest;
/** Verified local or valueless public testnet companion. Mainnet is always rejected. */
export class SurvivalVaultTransport implements SettlementTransport{
 readonly contract:Contract;
 readonly iface=new Interface(vaultAbi);
 readonly chain:bigint;readonly vault:string;readonly signer:string;
 readonly mode:'LOCAL_BLOCKCHAIN'|'PUBLIC_TESTNET';
 private finalizationLogs=new Map<string,{from:number;hash?:string}>();
 constructor(readonly provider:JsonRpcProvider,readonly gasSigner:Signer,readonly gasAddress:string,readonly manifest:SurvivalVaultManifest){
  if(manifest.chain!==31337n&&manifest.chain!==46630n)throw Error('Only local chain 31337 and public testnet 46630 are supported');
  this.mode=manifest.chain===31337n?'LOCAL_BLOCKCHAIN':'PUBLIC_TESTNET';
  this.chain=manifest.chain;this.vault=manifest.vault;this.signer=manifest.signer;this.contract=new Contract(this.vault,vaultAbi,provider);
 }
 async verify(){
  if(BigInt(await this.provider.send('eth_chainId',[]))!==this.chain)throw Error('Wrong chain');
  const m=this.manifest,c=this.contract;
  const [code,tokenCode,treasuryCode,token,treasury,signer,rules,gas]=await Promise.all([this.provider.getCode(this.vault),this.provider.getCode(m.token),this.provider.getCode(m.treasury),c.token(),c.treasury(),c.settlementSigner(),c.rulesHash(),this.gasSigner.getAddress()]);
  if(code==='0x'||tokenCode==='0x'||treasuryCode==='0x'||keccak256(code)!==m.vaultCodeHash||keccak256(tokenCode)!==m.tokenCodeHash||keccak256(treasuryCode)!==m.treasuryCodeHash||token.toLowerCase()!==m.token.toLowerCase()||treasury.toLowerCase()!==m.treasury.toLowerCase()||signer.toLowerCase()!==m.signer.toLowerCase()||rules!==m.rulesHash||gas.toLowerCase()!==this.gasAddress.toLowerCase())throw Error('Companion identity mismatch');
  if(new Set([m.deployment,m.signer,this.gasAddress].map(a=>a.toLowerCase())).size!==3)throw Error('Deployment, gameplay and gas roles must differ');
 }
 async chainNow(){return BigInt((await this.provider.send('eth_getBlockByNumber',['latest',false])).timestamp);}
 async receipt(hash:string):Promise<WorkerReceipt|null>{
  const r=await this.provider.getTransactionReceipt(hash);if(!r)return null;
  const [block,latest]=await Promise.all([this.provider.getBlock(r.blockNumber),this.provider.send('eth_blockNumber',[])]);
  return {status:r.status??0,confirmations:Math.max(0,Number(BigInt(latest))-r.blockNumber+1),canonical:block?.hash===r.blockHash};
 }
 async observe(result:SurvivalResult,attempts:SettlementAttempt[]){
  const [r,finalized,chainNow]=await Promise.all([this.contract.run(result.runId),this.contract.finalized(result.runId,result.segment),this.chainNow()]);
  let confirmations=0,matchingReceipt=false,searchingReceipt=false;
  if(finalized!=='0x'+'00'.repeat(32)){
   const key=result.runId+':'+result.segment,scan=this.finalizationLogs.get(key)??{from:this.manifest.fromBlock};
   // Prefer journaled hashes. Completed job audit must not scan an ever growing deployment range.
   const hashes=[...attempts.map(a=>a.hash),...(scan.hash?[scan.hash]:[])];
   for(const hash of hashes){
    const receipt=await this.provider.getTransactionReceipt(hash);if(!receipt||receipt.status!==1||receipt.to?.toLowerCase()!==this.vault.toLowerCase())continue;
    const match=receipt.logs.filter(l=>l.address.toLowerCase()===this.vault.toLowerCase()).some(l=>{try{const p=this.iface.parseLog(l);return p?.name==='Settled'&&p.args.runId===result.runId&&p.args.segment===result.segment&&p.args.authorization===finalized;}catch{return false;}});
    const observation=match?await this.receipt(hash):null;if(observation?.canonical){confirmations=observation.confirmations;matchingReceipt=true;scan.hash=hash;break;}
   }
   // A different valid holder may have submitted it. Keep bounded progress through rate limited log ranges.
   if(!matchingReceipt){
    const latest=Number(BigInt(await this.provider.send('eth_blockNumber',[])));
    if(scan.hash){scan.from=this.manifest.fromBlock;delete scan.hash;}
    for(let page=0;page<8&&scan.from<=latest;page++){
     const end=Math.min(latest,scan.from+1999),logs=await this.contract.queryFilter(this.contract.filters.Settled(result.runId,result.segment),scan.from,end);
     for(const l of logs){const parsed=this.iface.parseLog(l);if(parsed?.args.authorization===finalized){const receipt=await this.receipt(l.transactionHash);if(receipt?.canonical&&receipt.status===1){confirmations=receipt.confirmations;matchingReceipt=true;scan.hash=l.transactionHash;break;}}}
     scan.from=end+1;if(matchingReceipt)break;
    }
    searchingReceipt=!matchingReceipt&&scan.from<=latest;
    if(scan.from>latest&&!matchingReceipt)scan.from=this.manifest.fromBlock;
   }
   this.finalizationLogs.set(key,scan);
  }
  return {chainNow,deadline:BigInt(r.deadline),finalized:String(finalized),active:Boolean(r.active),segment:BigInt(r.segment),sequence:BigInt(r.sequence),deposit:BigInt(r.deposit),confirmations,matchingReceipt,searchingReceipt};
 }
 async gas(){const [balance,price,nonce]=await Promise.all([this.provider.getBalance(this.gasAddress),this.provider.send('eth_gasPrice',[]),this.provider.send('eth_getTransactionCount',[this.gasAddress,'latest'])]);return {balance,price:BigInt(price),nonce:Number(BigInt(nonce))};}
 private data(result:SurvivalResult,signature:string){return this.iface.encodeFunctionData('settle',[result,signature]);}
 async estimate(result:SurvivalResult,signature:string){return this.provider.estimateGas({from:this.gasAddress,to:this.vault,data:this.data(result,signature)});}
 async sign(result:SurvivalResult,signature:string,nonce:number,price:bigint,gas:bigint){const raw=await this.gasSigner.signTransaction({type:0,chainId:this.chain,to:this.vault,data:this.data(result,signature),value:0n,nonce,gasPrice:price,gasLimit:gas});return {raw,hash:keccak256(raw)};}
 validateAttempt(result:SurvivalResult,signature:string,a:SettlementAttempt){const tx=Transaction.from(a.raw);if(tx.hash!==a.hash||tx.from?.toLowerCase()!==this.gasAddress.toLowerCase()||tx.to?.toLowerCase()!==this.vault.toLowerCase()||tx.chainId!==this.chain||tx.data!==this.data(result,signature)||tx.value!==0n||tx.nonce!==a.nonce||tx.gasPrice!==BigInt(a.price)||tx.gasLimit!==BigInt(a.gas))throw Error('Invalid transaction journal');}
 async broadcast(raw:string){
  try{await this.provider.broadcastTransaction(raw);}catch{
   // A rebroadcast can report already known or nonce too low after mining. Only observed chain facts suppress it.
   const hash=keccak256(raw);if(!await this.provider.getTransactionReceipt(hash)&&!await this.provider.getTransaction(hash))throw Error('Broadcast unavailable');
  }
 }
}
export class LocalSurvivalVaultTransport extends SurvivalVaultTransport{
 constructor(provider:JsonRpcProvider,gasSigner:Signer,gasAddress:string,manifest:SurvivalVaultManifest){if(manifest.chain!==31337n)throw Error('Local funded transport requires chain 31337');super(provider,gasSigner,gasAddress,manifest);}
}
export class PublicSurvivalVaultTransport extends SurvivalVaultTransport{
 constructor(provider:JsonRpcProvider,gasSigner:Signer,gasAddress:string,manifest:SurvivalVaultManifest){if(manifest.chain!==46630n)throw Error('Public funded transport requires testnet 46630');super(provider,gasSigner,gasAddress,manifest);}
}
