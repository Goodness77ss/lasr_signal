import {Contract,JsonRpcProvider,id,parseEther,formatEther,keccak256} from 'ethers';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {TESTNET,json} from '@last-signal/chain';
import {loadKeys,loadSurvivalGas,secretFolder} from './testnet-keys.ts';
import {SurvivalPublicJournal} from './survival-public-journal.ts';
const root=resolve(import.meta.dirname,'../../..'),p=new JsonRpcProvider(TESTNET.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:1000});
try{
 if(BigInt(await p.send('eth_chainId',[]))!==46630n)throw Error('Wrong network');
 const m=JSON.parse(readFileSync(resolve(secretFolder,'survival-deployment.json'),'utf8')),keys=loadKeys(),gas=loadSurvivalGas(),abi=(n:string)=>JSON.parse(readFileSync(resolve(import.meta.dirname,'../abi',n+'.json'),'utf8'));
 if(m.chainId!==46630||m.deployer!==keys.deployer.address||m.gasWallet!==gas.address||m.gameplaySigner!==keys.settlement.address)throw Error('Public companion role mismatch');
 for(const [name,address]of Object.entries({token:m.token,treasury:m.treasury,vault:m.vault,welcomeGrant:m.welcomeGrant})){const code=await p.getCode(address as string);if(code==='0x'||keccak256(code)!==m.codeHashes[name])throw Error('Public companion code mismatch');}
 const token=new Contract(m.token,abi('TestWIF'),p),treasury=new Contract(m.treasury,abi('SurvivalTreasury'),p),grant=new Contract(m.welcomeGrant,abi('SurvivalWelcomeGrant'),p),campaign=id('LAST SIGNAL Survival V2 preview November 2026');
 const journal=new SurvivalPublicJournal(p,resolve(secretFolder,'survival-fund-journal.json'),json({chain:46630,token:m.token,treasury:m.treasury,grant:m.welcomeGrant,campaign,amount:'100'})),amount=parseEther('100');
 await journal.send('create named finite welcome campaign',keys.deployer,{to:m.welcomeGrant,data:grant.interface.encodeFunctionData('createCampaign',[campaign])});
 await journal.send('existing mock faucet for welcome budget',keys.deployer,{to:m.token,data:token.interface.encodeFunctionData('faucet')});
 await journal.send('approve exactly one welcome grant budget',keys.deployer,{to:m.token,data:token.interface.encodeFunctionData('approve',[m.welcomeGrant,amount])});
 await journal.send('fund finite welcome campaign with existing mock tokens',keys.deployer,{to:m.welcomeGrant,data:grant.interface.encodeFunctionData('fundCampaign',[campaign,amount])});
 await journal.send('existing mock faucet for finite reward pool',gas,{to:m.token,data:token.interface.encodeFunctionData('faucet')});
 await journal.send('approve exactly one hundred for reward backing',gas,{to:m.token,data:token.interface.encodeFunctionData('approve',[m.treasury,amount])});
 await journal.send('fund finite public test reward pool',gas,{to:m.treasury,data:treasury.interface.encodeFunctionData('fund',[amount])});
 if(await treasury.vault()!==m.vault||await token.allowance(keys.deployer.address,m.welcomeGrant)!==0n||await token.allowance(gas.address,m.treasury)!==0n)throw Error('Public backing verification mismatch');
 m.campaign=campaign;writeFileSync(resolve(secretFolder,'survival-deployment.json'),json(m));writeFileSync(resolve(root,'apps/web/public/survival-deployment.json'),json(m));
 const state=await grant.campaigns(campaign),report={checkedAt:new Date().toISOString(),mode:'PUBLIC_TESTNET_POOLS_FUNDED',manifest:m,receipts:journal.receipts,balances:{treasuryMock:formatEther(await token.balanceOf(m.treasury)),treasuryFreeMock:formatEther(await treasury.freeCapacity()),treasuryReservedMock:formatEther(await treasury.reserved()),welcomeMock:formatEther(await token.balanceOf(m.welcomeGrant)),campaignRemainingMock:formatEther(state.remaining),gasRoleTestEth:formatEther(await p.getBalance(gas.address))},limitations:['Finite backing is actual original mock tWIF, not official WIF.','Mock tokens came from the unchanged hourly faucet and explicit transfers. No token purchase or privileged mint.','Funding does not establish browser wallet gameplay or public worker availability.']};writeFileSync(resolve(root,'docs/evidence/v2-step15-funding.json'),json(report));console.log('Actual finite reward and welcome budgets funded. Public gameplay remains a separate gate.');
}catch(e){console.error((e as {code?:string}).code?'Public pool operation failed; inspect the journal before retrying.':(e as Error).message);process.exitCode=1;}finally{p.destroy();}
