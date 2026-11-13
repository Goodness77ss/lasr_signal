import {BrowserProvider,Contract,getAddress,keccak256,verifyTypedData,type JsonRpcProvider,type Signer,type TransactionResponse} from 'ethers';
import {SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,type SoldierProgressVoucher} from '@last-signal/chain';
import abi from '../../../packages/contracts/abi/JourneySoldiers.json';
export type ProgressWalletDeployment={chainId:31337;collection:string;codeHash:string;gameplaySigner:string;rulesHash:string};
export class JourneyProgressWallet {
 get metadata(){return {...this.deployment};}
 get owner(){return this.wallet;}
 private contract:Contract;private wallet:string;private deployment:ProgressWalletDeployment;
 constructor(private provider:BrowserProvider|JsonRpcProvider,private signer:Signer,wallet:string,deployment:ProgressWalletDeployment){
  if(deployment.chainId!==31337||![deployment.codeHash,deployment.rulesHash].every(value=>/^0x[0-9a-fA-F]{64}$/.test(value)))throw Error('Checked local progress deployment required');
  this.wallet=getAddress(wallet);this.deployment={...deployment,collection:getAddress(deployment.collection),gameplaySigner:getAddress(deployment.gameplaySigner)};this.contract=new Contract(this.deployment.collection,abi,signer);
 }
 async submit(voucher:SoldierProgressVoucher,signature:string):Promise<TransactionResponse>{
  const accounts=(await this.provider.send('eth_accounts',[]) as string[]).map(getAddress),d=this.deployment;
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n||getAddress(await this.signer.getAddress())!==this.wallet||(this.provider instanceof BrowserProvider?accounts[0]!==this.wallet:!accounts.includes(this.wallet)))throw Error('Progress wallet or network changed');
  const head=BigInt(await this.provider.send('eth_blockNumber',[]));if(head>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported progress block');
  const at={blockTag:head},code=await this.provider.getCode(d.collection,head),block=await this.provider.getBlock(head);
  if(code==='0x'||keccak256(code)!==d.codeHash||getAddress(await this.contract.gameplaySigner(at))!==d.gameplaySigner||String(await this.contract.rulesHash(at)).toLowerCase()!==d.rulesHash.toLowerCase())throw Error('Progress collection identity mismatch');
  if(!block||getAddress(voucher.owner)!==this.wallet||getAddress(await this.contract.ownerOf(voucher.tokenId,at))!==this.wallet||String(await this.contract.progressNonce(voucher.tokenId,at))!==voucher.nonce||BigInt(voucher.expiry)<=BigInt(block.timestamp)||voucher.rulesHash.toLowerCase()!==d.rulesHash.toLowerCase()||voucher.policy!==SOLDIER_PROGRESS_POLICY)throw Error('Progress voucher authority changed');
  if(getAddress(verifyTypedData(soldierProgressDomain(31337n,d.collection),soldierProgressTypes,voucher,signature))!==d.gameplaySigner)throw Error('Progress voucher signer mismatch');
  return (await this.contract.applyProgress(voucher,signature) as TransactionResponse).replaceableTransaction(Number(head));
 }
}
