import {BrowserProvider,Contract,getAddress,keccak256,type JsonRpcProvider,type Signer,type TransactionResponse} from 'ethers';
import {JOURNEY_SOLDIER_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunBuild,soldierRunHash} from '@last-signal/chain';
import type {ProgressWalletDeployment} from './journey-progress-wallet.ts';
import abi from '../../../packages/contracts/abi/JourneySoldiers.json';
import gunAbi from '../../../packages/contracts/abi/JourneyGunCollection.json';
export class JourneyOwnedWallet {
 private contract:Contract;readonly owner:string;
 constructor(private provider:BrowserProvider|JsonRpcProvider,private signer:Signer,owner:string,readonly deployment:ProgressWalletDeployment,readonly service:string){
  if(deployment.chainId!==31337||!/^0x[0-9a-fA-F]{64}$/.test(deployment.codeHash))throw Error('Checked local soldier deployment required');
  this.owner=getAddress(owner);this.service=getAddress(service);this.contract=new Contract(getAddress(deployment.collection),abi,signer);
 }
 private async verify(){
  const accounts=(await this.provider.send('eth_accounts',[]) as string[]).map(getAddress);
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n||getAddress(await this.signer.getAddress())!==this.owner||(this.provider instanceof BrowserProvider?accounts[0]!==this.owner:!accounts.includes(this.owner)))throw Error('Soldier wallet or network changed');
  const head=BigInt(await this.provider.send('eth_blockNumber',[])),at={blockTag:head};
  if(keccak256(await this.provider.getCode(this.deployment.collection,head))!==this.deployment.codeHash||String(await this.contract.rulesHash(at)).toLowerCase()!==this.deployment.rulesHash.toLowerCase()||getAddress(await this.contract.gameplaySigner(at))!==getAddress(this.deployment.gameplaySigner))throw Error('Soldier deployment identity mismatch');
  return {head,at};
 }
 async inspect(tokenId:string){
  if(!/^[1-9][0-9]*$/.test(tokenId))throw Error('Positive soldier token ID required');
  const {head,at}=await this.verify();if(getAddress(await this.contract.ownerOf(tokenId,at))!==this.owner)throw Error('Soldier belongs to another wallet');
  const classId=Number(await this.contract.classOf(tokenId,at)),build=JOURNEY_SOLDIER_BUILDS[classId];
  if(!build||String(await this.contract.buildHash(tokenId,at)).toLowerCase()!==build.hash.toLowerCase())throw Error('Unsupported soldier class');
  const lease=await this.contract.runLease(tokenId,at);
  return {tokenId,classId:build.classId,buildHash:build.hash,lease:{id:String(lease.id),runId:String(lease.runId),service:getAddress(lease.service),expiresAt:String(lease.expiresAt)},active:Boolean(await this.contract.leaseActive(tokenId,at)),head};
 }
 async owned(){
  const {at}=await this.verify(),count=BigInt(await this.contract.balanceOf(this.owner,at));if(count>70n)throw Error('Owned inventory exceeds the local development collection limit');
  const ids:string[]=[];for(let offset=0;BigInt(offset)<count;offset+=32){const page=await this.contract.ownedPage(this.owner,offset,32,at);ids.push(...Array.from(page.ids??page[0],value=>String(value)));}
  return Promise.all(ids.map(tokenId=>this.inspect(tokenId)));
 }
 async ownedGuns(deployment:{chainId:number;collection:string;codeHash:string;currency:string;gameplaySigner:string;rulesHash:string}){
  const {at,head}=await this.verify();if(deployment.chainId!==31337||keccak256(await this.provider.getCode(deployment.collection,head)).toLowerCase()!==deployment.codeHash.toLowerCase())throw Error('Gun collection identity mismatch');
  const gun=new Contract(deployment.collection,gunAbi,this.provider);if(getAddress(await gun.currency(at))!==getAddress(deployment.currency)||getAddress(await gun.gameplaySigner(at))!==getAddress(deployment.gameplaySigner)||await gun.rulesHash(at)!==JOURNEY_GUN_RECOVERY_RULES||deployment.rulesHash!==JOURNEY_GUN_RECOVERY_RULES)throw Error('Unsupported gun collection');
  const ids=await gun.ownedPage(this.owner,0,32,at) as bigint[];
  return Promise.all(ids.map(async id=>{const tokenId=String(id),kind=Number(await gun.gunKind(id,at)),build=journeyGunBuild(kind);if(getAddress(await gun.ownerOf(id,at))!==this.owner||String(await gun.buildHash(id,at))!==build.hash)throw Error('Gun owner or build changed');return {tokenId,name:build.build.name};}));
 }
 async leaseOutcome(hash:string,nonce:number,tokenId:string,runId:string):Promise<'confirmed'|'cancelled'>{
  await this.verify();if(!/^0x[0-9a-fA-F]{64}$/.test(hash)||!Number.isSafeInteger(nonce)||nonce<0)throw Error('Exact pending lease identity required');
  const tx=await this.provider.getTransaction(hash),receipt=await this.provider.getTransactionReceipt(hash);
  if(!tx||!receipt)throw Error('Lease is still pending or replaced');
  if(getAddress(tx.from)!==this.owner||tx.nonce!==nonce)throw Error('Lease replacement wallet or nonce mismatch');
  const block=await this.provider.getBlock(receipt.blockNumber),head=BigInt(await this.provider.send('eth_blockNumber',[]));
  if(block?.hash!==receipt.blockHash||head<BigInt(receipt.blockNumber)+1n)throw Error('Lease requires two canonical confirmations');
  if(receipt.status!==1||tx.to&&getAddress(tx.to)===this.owner&&tx.data==='0x'&&tx.value===0n)return 'cancelled';
  const parsed=this.contract.interface.parseTransaction({data:tx.data,value:tx.value});
  if(!tx.to||getAddress(tx.to)!==getAddress(this.deployment.collection)||parsed?.name!=='startLease'||String(parsed.args.tokenId)!==tokenId||parsed.args.runId!==soldierRunHash(runId)||getAddress(parsed.args.service)!==this.service)throw Error('Replacement is not the exact run lease');
  return 'confirmed';
 }
 async startLease(tokenId:string,runId:string):Promise<TransactionResponse>{
  const token=await this.inspect(tokenId);if(token.active)throw Error('Soldier already has an active deployment lease');
  if(token.head>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported chain block');
  const block=await this.provider.getBlock(token.head);if(!block)throw Error('Chain time unavailable');
  return (await this.contract.startLease(tokenId,soldierRunHash(runId),this.service,BigInt(block.timestamp)+3600n) as TransactionResponse).replaceableTransaction(Number(token.head));
 }
}

