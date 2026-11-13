import {keccak256,Transaction,type JsonRpcProvider,type Wallet,type TransactionRequest,type TransactionReceipt} from 'ethers';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {json} from '@last-signal/chain';
type Operation={hash:string;raw:string;from:string;nonce:number};
export class SurvivalPublicJournal{
 private journal:{identity:string;operations:Record<string,Operation>};
 readonly receipts:{label:string;hash:string;block:number;blockHash:string;status:number;gasUsed:string}[]=[];
 constructor(private provider:JsonRpcProvider,private file:string,identity:string){this.journal=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{identity,operations:{}};if(this.journal.identity!==identity)throw Error('Public operation journal identity changed');}
 async send(label:string,wallet:Wallet,request:TransactionRequest):Promise<TransactionReceipt>{
  const p=this.provider;if(BigInt(await p.send('eth_chainId',[]))!==46630n)throw Error('Public testnet 46630 required');let op=this.journal.operations[label];
  if(!op){const from=wallet.address,nonce=await p.getTransactionCount(from,'pending'),price=BigInt(await p.send('eth_gasPrice',[])),limit=(await p.estimateGas({...request,from}))*120n/100n;if(await p.getBalance(from)<limit*price+BigInt(request.value??0))throw Error('Insufficient free test gas');const raw=await wallet.signTransaction({...request,type:0,chainId:46630n,nonce,gasPrice:price,gasLimit:limit});op={hash:keccak256(raw),raw,from,nonce};this.journal.operations[label]=op;writeFileSync(this.file,json(this.journal));}
  const signed=Transaction.from(op.raw);
  if(op.from!==wallet.address||signed.from!==wallet.address||signed.hash!==op.hash||signed.chainId!==46630n||signed.nonce!==op.nonce||signed.to?.toLowerCase()!==String(request.to).toLowerCase()||signed.value!==BigInt(request.value??0)||signed.data!==(request.data??'0x'))throw Error('Public operation journal differs from intended call');let receipt=await p.getTransactionReceipt(op.hash);
  if(!receipt){if(await p.getTransactionCount(wallet.address,'latest')>op.nonce)throw Error('Public nonce consumed without journal receipt');try{await p.broadcastTransaction(op.raw);}catch{if(!await p.getTransactionReceipt(op.hash)&&!await p.getTransaction(op.hash))throw Error('Public broadcast unavailable; journal retained');}receipt=await p.waitForTransaction(op.hash,2,120000);}
  if(receipt&&await receipt.confirmations()<2)receipt=await p.waitForTransaction(op.hash,2,120000);
  if(!receipt||receipt.status!==1||(await p.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw Error('Public operation lacks a successful canonical receipt');this.receipts.push({label,hash:receipt.hash,block:receipt.blockNumber,blockHash:receipt.blockHash,status:1,gasUsed:String(receipt.gasUsed)});console.log(label+' confirmed: '+receipt.hash);return receipt;
 }
}
