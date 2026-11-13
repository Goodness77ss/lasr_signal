import {Contract,ContractFactory,JsonRpcProvider,keccak256,getCreateAddress,parseEther,formatEther,type Wallet,type TransactionRequest} from 'ethers';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TESTNET,json,survivalRulesHash} from '@last-signal/chain';
import {FUNDED_SURVIVAL_RULES} from '@last-signal/sim';
import {compile} from './compile.ts';
import {loadKeys,loadSurvivalGas,secretFolder} from './testnet-keys.ts';

type Operation={hash:string;raw:string;from:string;nonce:number;contract?:string};
type Journal={source:string;token:string;chain:number;operations:Record<string,Operation>};
const root=resolve(import.meta.dirname,'../../..'),p=new JsonRpcProvider(TESTNET.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:1000});
try{
 if(BigInt(await p.send('eth_chainId',[]))!==46630n)throw Error('Expected verified public testnet only');
 const keys=loadKeys(),gas=loadSurvivalGas(true),artifacts=compile(),rules=survivalRulesHash(FUNDED_SURVIVAL_RULES);
 const original=JSON.parse(readFileSync(resolve(root,'apps/web/public/testnet-deployment.json'),'utf8'));
 if(original.chainId!==46630)throw Error('Original manifest is not the testnet');
 const token=new Contract(original.token,artifacts.TestWIF.abi,p),code=await p.getCode(original.token);
 if(code==='0x'||keccak256(code)!==original.tokenCodeHash||await token.decimals()!==18n||await token.name()!=='LAST SIGNAL Test WIF'||await token.symbol()!=='tWIF')throw Error('Original mock currency identity mismatch');
 const source=createHash('sha256').update(json({compiler:artifacts.SurvivalRunVault.compiler,rules,token:original.token,contracts:['SurvivalTreasury','SurvivalRunVault','SurvivalWelcomeGrant'].map(n=>artifacts[n].bytecode)})).digest('hex');
 const file=resolve(secretFolder,'survival-deploy-journal.json'),journal:Journal=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{source,token:original.token,chain:46630,operations:{}};
 if(journal.source!==source||journal.token!==original.token||journal.chain!==46630)throw Error('Existing companion deployment source differs; preserve it and review a new version');
 const save=()=>writeFileSync(file,json(journal));const receipts:{label:string;hash:string;block:number;blockHash:string;status:number;contract:string|null;gasUsed:string}[]=[];
 async function send(label:string,wallet:Wallet,request:TransactionRequest){
  let op=journal.operations[label];
  if(!op){
   const from=wallet.address,nonce=await p.getTransactionCount(from,'pending'),gasPrice=BigInt(await p.send('eth_gasPrice',[])),estimate=await p.estimateGas({...request,from}),gasLimit=estimate*120n/100n;
   if(await p.getBalance(from)<gasLimit*gasPrice+BigInt(request.value??0))throw Error('Insufficient free test gas. No purchase or mainnet fallback');
   const raw=await wallet.signTransaction({...request,type:0,chainId:46630n,nonce,gasPrice,gasLimit});op={hash:keccak256(raw),raw,from,nonce,...(!request.to?{contract:getCreateAddress({from,nonce})}:{})};journal.operations[label]=op;save();
  }
  if(op.from!==wallet.address)throw Error('Journal role mismatch');
  let receipt=await p.getTransactionReceipt(op.hash);
  if(!receipt){
   const nonce=await p.getTransactionCount(wallet.address,'latest');if(nonce>op.nonce)throw Error('Journal nonce consumed without matching receipt. Reconcile before retry');
   try{await p.broadcastTransaction(op.raw);}catch{if(!await p.getTransactionReceipt(op.hash)&&!await p.getTransaction(op.hash))throw Error('Broadcast unavailable; journal retained');}
   receipt=await p.waitForTransaction(op.hash,2,120000);
  }
  if(!receipt||receipt.status!==1)throw Error('Companion transaction pending or unsuccessful. Do not blindly retry');
  const head=await p.getBlockNumber();if(head-receipt.blockNumber+1<2)receipt=await p.waitForTransaction(op.hash,2,120000);
  if(!receipt||receipt.status!==1||(await p.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw Error('Receipt lacks canonical confirmation');
  if(op.contract&&receipt.contractAddress!==op.contract)throw Error('Unexpected companion address');
  receipts.push({label,hash:receipt.hash,block:receipt.blockNumber,blockHash:receipt.blockHash,status:receipt.status,contract:receipt.contractAddress,gasUsed:String(receipt.gasUsed)});console.log(label+' confirmed: '+receipt.hash);return receipt;
 }
 const deployer=keys.deployer;
 await send('deploy finite SurvivalTreasury',deployer,await new ContractFactory(artifacts.SurvivalTreasury.abi,artifacts.SurvivalTreasury.bytecode).getDeployTransaction(original.token,deployer.address));
 const treasuryAddress=journal.operations['deploy finite SurvivalTreasury'].contract!;
 await send('deploy bounded SurvivalRunVault',deployer,await new ContractFactory(artifacts.SurvivalRunVault.abi,artifacts.SurvivalRunVault.bytecode).getDeployTransaction(original.token,treasuryAddress,keys.settlement.address,rules));
 const vaultAddress=journal.operations['deploy bounded SurvivalRunVault'].contract!;
 await send('deploy campaign SurvivalWelcomeGrant',deployer,await new ContractFactory(artifacts.SurvivalWelcomeGrant.abi,artifacts.SurvivalWelcomeGrant.bytecode).getDeployTransaction(original.token,deployer.address));
 const grantAddress=journal.operations['deploy campaign SurvivalWelcomeGrant'].contract!;
 const treasury=new Contract(treasuryAddress,artifacts.SurvivalTreasury.abi,p),vault=new Contract(vaultAddress,artifacts.SurvivalRunVault.abi,p),grant=new Contract(grantAddress,artifacts.SurvivalWelcomeGrant.abi,p);
 await send('bind fixed SurvivalRunVault',deployer,{to:treasuryAddress,data:treasury.interface.encodeFunctionData('bindVault',[vaultAddress])});
 if(await treasury.vault()!==vaultAddress||await vault.treasury()!==treasuryAddress||await vault.token()!==original.token||await vault.settlementSigner()!==keys.settlement.address||await vault.rulesHash()!==rules||await grant.token()!==original.token||await grant.campaignAdmin()!==deployer.address)throw Error('Companion immutable readback mismatch');
 // Only existing free test ETH moves to the new dedicated gas role. Existing participant balances are not spent here.
 await send('free test gas for separate survival submission role',deployer,{to:gas.address,value:parseEther('0.00003')});
 const codeHashes={token:original.tokenCodeHash,treasury:keccak256(await p.getCode(treasuryAddress)),vault:keccak256(await p.getCode(vaultAddress)),welcomeGrant:keccak256(await p.getCode(grantAddress))};
 const manifest={version:'survival-2.7.0',chainId:46630,rpc:TESTNET.rpc,token:original.token,treasury:treasuryAddress,vault:vaultAddress,welcomeGrant:grantAddress,gameplaySigner:keys.settlement.address,gasWallet:gas.address,deployer:deployer.address,rulesHash:rules,deploymentBlock:Math.min(...receipts.filter(r=>r.contract).map(r=>r.block)),codeHashes,confirmations:2,publicOperation:false,browserWalletProof:false};
 writeFileSync(resolve(secretFolder,'survival-deployment.json'),json(manifest));
 const report={checkedAt:new Date().toISOString(),mode:'PUBLIC_TESTNET_COMPANIONS_ONLY',compiler:artifacts.SurvivalRunVault.compiler,manifest,receipts,balances:{deployerTestEth:formatEther(await p.getBalance(deployer.address)),gasRoleTestEth:formatEther(await p.getBalance(gas.address)),treasuryMock:formatEther(await token.balanceOf(treasuryAddress)),reservedMock:formatEther(await treasury.reserved()),grantMock:formatEther(await token.balanceOf(grantAddress))},limitations:['Only valueless existing test ETH and original mock tWIF are supported.','Treasury and welcome campaign funding are separate explicit operations.','No funded gameplay, browser wallet proof, public service availability or official WIF eligibility is implied.','Two canonical L2 blocks are soft confirmations, not Ethereum finality.']};
 writeFileSync(resolve(root,'docs/evidence/v2-step15-deployment.json'),json(report));console.log('Companions deployed and read back. Reward and welcome pools remain unfunded.');
}catch(e){console.error((e as {code?:string}).code?'Public companion operation failed; reconcile the private journal and public receipts before retrying.':(e as Error).message);process.exitCode=1;}finally{p.destroy();}
