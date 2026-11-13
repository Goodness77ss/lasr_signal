import {Contract,Interface,getAddress,keccak256,type JsonRpcProvider} from 'ethers';
import {readFileSync} from 'node:fs';
import type {SupplyReceiptVerifier,SupplyRedemption} from './journey-supplies.ts';
export type SupplyDeployment=Readonly<{chainId:31337;collection:string;codeHash:string;policyHash:string}>;
export class JourneySupplyReceipts implements SupplyReceiptVerifier {
 private readonly contract:Contract;
 private readonly abi:Interface;
 readonly deployment:SupplyDeployment;
 constructor(private provider:JsonRpcProvider,deployment:SupplyDeployment){
  if(deployment.chainId!==31337||!/^0x[0-9a-fA-F]{64}$/.test(deployment.codeHash)||!/^0x[0-9a-fA-F]{64}$/.test(deployment.policyHash))throw Error('Invalid local supply deployment');
  this.deployment=Object.freeze({...deployment,collection:getAddress(deployment.collection)});
  this.abi=new Interface(JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/JourneySupplies.json',import.meta.url),'utf8')));
  this.contract=new Contract(this.deployment.collection,this.abi,provider);
 }
 async canonical(event:SupplyRedemption):Promise<boolean>{
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n)throw Error('Supply chain mismatch');
  if(getAddress(event.collection)!==this.deployment.collection)throw Error('Supply collection mismatch');
  const receipt=await this.provider.getTransactionReceipt(event.transactionHash);
  if(!receipt||receipt.status!==1||receipt.blockHash.toLowerCase()!==event.blockHash.toLowerCase())return false;
  const block=await this.provider.getBlock(receipt.blockNumber);
  if(!block||block.hash?.toLowerCase()!==event.blockHash.toLowerCase())return false;
  const head=BigInt(await this.provider.send('eth_blockNumber',[]));
  return head>=BigInt(receipt.blockNumber)+1n;
 }
 async verify(transactionHash:string,logIndex:number):Promise<SupplyRedemption>{
  if(!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)||!Number.isSafeInteger(logIndex)||logIndex<0)throw Error('Invalid receipt identity');
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n)throw Error('Supply chain mismatch');
  const receipt=await this.provider.getTransactionReceipt(transactionHash);
  if(!receipt||receipt.status!==1)throw Error('Successful supply receipt required');
  const block=await this.provider.getBlock(receipt.blockNumber);
  if(!block||block.hash!==receipt.blockHash)throw Error('Supply receipt orphaned');
  const at={blockTag:receipt.blockNumber},code=await this.provider.getCode(this.deployment.collection,receipt.blockNumber);
  if(code==='0x'||keccak256(code)!==this.deployment.codeHash)throw Error('Supply code mismatch');
  if(String(await this.contract.policyHash(at)).toLowerCase()!==this.deployment.policyHash.toLowerCase()||BigInt(await this.contract.UNITS_PER_PACK(at))!==3n)throw Error('Supply policy mismatch');
  const log=receipt.logs.find(log=>log.index===logIndex);
  if(!log||getAddress(log.address)!==this.deployment.collection)throw Error('Supply event collection mismatch');
  const parsed=this.abi.parseLog(log);
  if(!parsed||parsed.name!=='Redeemed')throw Error('Supply redemption event required');
  const {owner,itemClass,packs,units,policyHash}=parsed.args;
  if(BigInt(packs)<=0n||BigInt(units)!==BigInt(packs)*3n||BigInt(itemClass)>3n||String(policyHash).toLowerCase()!==this.deployment.policyHash.toLowerCase())throw Error('Supply event policy mismatch');
  const head=BigInt(await this.provider.send('eth_blockNumber',[]));
  return {chainId:'31337',transactionHash:receipt.hash,logIndex,collection:this.deployment.collection,owner:getAddress(owner),itemClass:Number(itemClass),packs:String(packs),blockHash:receipt.blockHash,confirmed:head>=BigInt(receipt.blockNumber)+1n};
 }
}

