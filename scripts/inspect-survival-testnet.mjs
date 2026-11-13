import {readFileSync,writeFileSync} from 'node:fs';
import {JsonRpcProvider,Contract,keccak256} from 'ethers';

// Read only. No role keys, wallet requests, faucet calls or transactions.
const manifest=JSON.parse(readFileSync(new URL('../apps/web/public/survival-deployment.json',import.meta.url),'utf8'));
const abi=name=>JSON.parse(readFileSync(new URL(`../packages/contracts/abi/${name}.json`,import.meta.url),'utf8'));
const endpoints=[manifest.rpc,'https://robinhood-testnet.drpc.org'];
const reads=await Promise.all(endpoints.map(async rpc=>{
 const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1,batchMaxCount:1});
 const result={rpc,passed:false};
 try{
  result.chainId=Number(BigInt(await provider.send('eth_chainId',[])));
  if(result.chainId!==46630||manifest.chainId!==46630)throw Error('Testnet chain identity mismatch');
  result.head=Number(BigInt(await provider.send('eth_blockNumber',[])));
  result.codeMatches={};
  for(const name of ['token','treasury','vault','welcomeGrant']){
   result.codeMatches[name]=keccak256(await provider.getCode(manifest[name]))===manifest.codeHashes[name];
   if(!result.codeMatches[name])throw Error('Deployed companion code mismatch');
  }
  const token=new Contract(manifest.token,abi('TestWIF'),provider);
  const treasury=new Contract(manifest.treasury,abi('SurvivalTreasury'),provider);
  const vault=new Contract(manifest.vault,abi('SurvivalRunVault'),provider);
  const grant=new Contract(manifest.welcomeGrant,abi('SurvivalWelcomeGrant'),provider);
  const [free,locked,claims,custody,campaign]=await Promise.all([
   treasury.freeCapacity(),vault.lockedLiability(),vault.claimLiability(),token.balanceOf(manifest.vault),grant.campaigns(manifest.campaign)
  ]);
  result.amounts={unit:'18 decimal mock token base units',rewardFree:String(free),lockedLiability:String(locked),claimLiability:String(claims),vaultCustody:String(custody),welcomeRemaining:String(campaign.remaining)};
  result.custodyCoversLiabilities=custody>=locked+claims;
  if(!result.custodyCoversLiabilities)throw Error('Vault liabilities exceed custody');
  result.passed=true;
 }catch(error){result.error=error.shortMessage??error.message??'RPC inspection failed';}
 finally{provider.destroy();}
 return result;
}));
const report={observedAt:new Date().toISOString(),mode:'PUBLIC_TESTNET_READ_ONLY',performsBrowserWalletProof:false,browserWalletEvidence:'v2-step15-browser-final-claim.json and v2-step15-actual-browser-closed.json',reads};
writeFileSync(new URL('../docs/evidence/v2-step15-current-state.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(reads.some(read=>!read.passed))process.exitCode=1;
