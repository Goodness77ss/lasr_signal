import {BrowserProvider,Contract,getAddress,keccak256,isError,type JsonRpcProvider,type Signer,type TransactionResponse} from 'ethers';
import abi from '../../../packages/contracts/abi/JourneySupplies.json';
export type SupplyWalletDeployment={chainId:31337;collection:string;codeHash:string;policyHash:string};
export class SupplyWallet {
 protected contract:Contract;
 readonly wallet:string;
 readonly deployment:SupplyWalletDeployment;
 constructor(protected provider:BrowserProvider|JsonRpcProvider,protected signer:Signer,wallet:string,deployment:SupplyWalletDeployment){
  this.wallet=getAddress(wallet);this.deployment={...deployment,collection:getAddress(deployment.collection)};
  if(deployment.chainId!==31337||!/^0x[0-9a-fA-F]{64}$/.test(deployment.codeHash)||!/^0x[0-9a-fA-F]{64}$/.test(deployment.policyHash))throw Error('Checked local supply deployment required');
  this.contract=new Contract(this.deployment.collection,abi,signer);
 }
 async verify(){
  const accounts=(await this.provider.send('eth_accounts',[]) as string[]).map(getAddress);
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n||getAddress(await this.signer.getAddress())!==this.wallet||(this.provider instanceof BrowserProvider?accounts[0]!==this.wallet:!accounts.includes(this.wallet)))throw Error('Wallet or network changed');
  const code=await this.provider.getCode(this.deployment.collection);
  if(code==='0x'||keccak256(code)!==this.deployment.codeHash||String(await this.contract.policyHash()).toLowerCase()!==this.deployment.policyHash.toLowerCase()||BigInt(await this.contract.UNITS_PER_PACK())!==3n)throw Error('Supply deployment mismatch');
 }
 async packs(itemClass:number){if(!Number.isInteger(itemClass)||itemClass<0||itemClass>3)throw Error('Invalid supply class');await this.verify();return BigInt(await this.contract.balanceOf(this.wallet,itemClass));}
 async redeem(itemClass:number,quantity:bigint):Promise<TransactionResponse>{
  if(quantity<1n||quantity>await this.packs(itemClass))throw Error('Insufficient unopened packs');
  await this.verify();const head=BigInt(await this.provider.send('eth_blockNumber',[]));if(head>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported block');
  return (await this.contract.redeem(itemClass,quantity) as TransactionResponse).replaceableTransaction(Number(head));
 }
 async waitRedemption(tx:TransactionResponse,itemClass:number,quantity:bigint,onReplacement:(hash:string)=>void){
  let receipt;
  try{receipt=await tx.wait(2);}catch(error){
   if(!isError(error,'TRANSACTION_REPLACED'))throw error;
   onReplacement(error.replacement.hash);
   if(error.cancelled)throw new SupplyRedemptionCancelled();
   receipt=error.receipt;
  }
  if(!receipt||receipt.status!==1)throw Error('Pack redemption did not confirm');
  this.redemptionLog(receipt,itemClass,quantity);
  return this.confirmedRedemption(receipt.hash,itemClass,quantity);
 }
 async replacementOutcome(hash:string,nonce:number):Promise<'cancelled'|'redemption'>{
  await this.verify();if(!/^0x[0-9a-fA-F]{64}$/.test(hash)||!Number.isSafeInteger(nonce)||nonce<0)throw Error('Invalid replacement identity');
  const tx=await this.provider.getTransaction(hash),receipt=await this.provider.getTransactionReceipt(hash);
  if(!tx||!receipt||getAddress(tx.from)!==this.wallet||tx.nonce!==nonce)throw Error('Replacement wallet or nonce mismatch');
  const block=await this.provider.getBlock(receipt.blockNumber),head=BigInt(await this.provider.send('eth_blockNumber',[]));
  if(block?.hash!==receipt.blockHash||head<BigInt(receipt.blockNumber)+1n)throw Error('Replacement needs two canonical confirmations');
  if(receipt.status!==1)return 'cancelled';
  if(tx.to&&getAddress(tx.to)===this.wallet&&tx.data==='0x'&&tx.value===0n)return 'cancelled';
  if(!tx.to||getAddress(tx.to)!==this.deployment.collection)throw Error('Replacement was not a supply redemption');
  return 'redemption';
 }
 async confirmedRedemption(hash:string,itemClass:number,quantity:bigint){
  await this.verify();if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Invalid pending redemption hash');
  const receipt=await this.provider.getTransactionReceipt(hash);
  if(!receipt)throw Error('Redemption is pending or was replaced. No new pack was burned.');
  if(receipt.status!==1)throw Error('Redemption failed. No opened stock was granted.');
  const head=BigInt(await this.provider.send('eth_blockNumber',[])),block=await this.provider.getBlock(receipt.blockNumber);
  if(block?.hash!==receipt.blockHash||head<BigInt(receipt.blockNumber)+1n)throw Error('Redemption needs two canonical confirmations');
  return {transactionHash:receipt.hash,logIndex:this.redemptionLog(receipt,itemClass,quantity)};
 }
 redemptionLog(receipt:{logs:readonly {address:string;topics:readonly string[];data:string;index:number}[]},itemClass:number,quantity:bigint){
  const found=receipt.logs.filter(log=>getAddress(log.address)===this.deployment.collection).filter(log=>{try{const event=this.contract.interface.parseLog(log);return event?.name==='Redeemed'&&getAddress(event.args.owner)===this.wallet&&BigInt(event.args.itemClass)===BigInt(itemClass)&&BigInt(event.args.packs)===quantity&&BigInt(event.args.units)===quantity*3n&&String(event.args.policyHash).toLowerCase()===this.deployment.policyHash.toLowerCase();}catch{return false;}});
  if(found.length!==1)throw Error('Exact redemption event required');return found[0].index;
 }
}


export class SupplyRedemptionCancelled extends Error {constructor(){super('Pack redemption cancelled. No opened stock was granted.');}}



