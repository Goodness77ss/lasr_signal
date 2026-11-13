import {Contract,JsonRpcProvider,getAddress,parseEther,formatEther} from 'ethers';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {TESTNET,json} from '@last-signal/chain';
import {loadRole,secretFolder} from './testnet-keys.ts';
import {SurvivalPublicJournal} from './survival-public-journal.ts';
const provider=new JsonRpcProvider(TESTNET.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:1000});
try{
 const recipient=getAddress(process.argv[2]??'');if(BigInt(await provider.send('eth_chainId',[]))!==46630n)throw Error('Testnet only');
 const m=JSON.parse(readFileSync(resolve(secretFolder,'survival-deployment.json'),'utf8')),abi=(n:string)=>JSON.parse(readFileSync(resolve(import.meta.dirname,'../abi',n+'.json'),'utf8')),token=new Contract(m.token,abi('TestWIF'),provider),grant=new Contract(m.welcomeGrant,abi('SurvivalWelcomeGrant'),provider),donor=loadRole('playerB'),deployer=loadRole('deployer');
 if(m.chainId!==46630||m.deployer!==deployer.address)throw Error('Companion role mismatch');
 const journal=new SurvivalPublicJournal(provider,resolve(secretFolder,'survival-browser-budget-journal.json'),json({chain:46630,grant:m.welcomeGrant,campaign:m.campaign,recipient}));
 if((await grant.campaigns(m.campaign)).remaining<parseEther('100')){
  const before=await token.balanceOf(donor.address);
  await journal.send('fresh mock faucet for browser welcome budget',donor,{to:m.token,data:token.interface.encodeFunctionData('faucet')});
  await journal.send('approve exactly one browser welcome budget',donor,{to:m.token,data:token.interface.encodeFunctionData('approve',[m.welcomeGrant,parseEther('100')])});
  await journal.send('fund finite browser welcome budget',donor,{to:m.welcomeGrant,data:grant.interface.encodeFunctionData('fundCampaign',[m.campaign,parseEther('100')])});
  if(await token.balanceOf(donor.address)<before)throw Error('Existing donor token holdings were consumed');
 }
 if(await provider.getBalance(recipient)<parseEther('0.00003'))await journal.send('free test gas for approved browser wallet',deployer,{to:recipient,value:parseEther('0.00003')});
 const report={checkedAt:new Date().toISOString(),mode:'PUBLIC_TESTNET_BROWSER_BUDGET_PREPARED',chainId:46630,welcomeGrant:m.welcomeGrant,campaign:m.campaign,welcomeRemainingMock:formatEther((await grant.campaigns(m.campaign)).remaining),recipient:'Owner approved connected Chrome wallet. Recipient metadata stays in the private runtime journal.',receipts:journal.receipts,limitations:['Only valueless existing test ETH and freshly requested original mock tokens.','This prepares the wallet proof; no browser claim, allocation, mission or settlement is implied.']};writeFileSync(resolve(import.meta.dirname,'../../../docs/evidence/v2-step15-browser-budget.json'),json(report));console.log('Approved browser testnet budget prepared. No private wallet metadata published.');
}catch{console.error('Browser testnet preparation failed; private journal retained and recipient data suppressed.');process.exitCode=1;}finally{provider.destroy();}
