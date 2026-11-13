import {id,parseEther,type JsonRpcProvider} from 'ethers';
import {FUNDED_SURVIVAL_RULES} from '@last-signal/sim';
import {survivalRulesHash,survivalVaultDomain,survivalEntryTypes,survivalResultTypes,survivalMissionTypes,type SurvivalEntry,type SurvivalResult,type SurvivalMissionPermit} from '@last-signal/chain';
import {compile} from '../scripts/compile.ts';
import {fixture,deploy,as,receipt,timestamp,at} from '../scripts/shared.ts';
export async function vaultFixture(provider:JsonRpcProvider,artifacts=compile(),tokenName='TestWIF'){
 const f=await fixture(provider,artifacts,tokenName),rules=survivalRulesHash(FUNDED_SURVIVAL_RULES);
 const treasury=await deploy(artifacts.SurvivalTreasury,f.deployer,[f.token.target,f.deployer.address],f.receipts,'deploy finite treasury');
 const vault=await deploy(artifacts.SurvivalRunVault,f.deployer,[f.token.target,treasury.target,f.authority.address,rules],f.receipts,'deploy actual local SurvivalRunVault');
 await receipt(treasury.bindVault(vault.target),'bind actual local vault',f.receipts);
 if(tokenName==='TestWIF')await receipt(as(f.token,f.deployer).faucet(),'public mock faucet for local reward pool',f.receipts);
 else await receipt(f.token.mint(f.deployer.address,parseEther('100')),'malicious token fixture funding only',f.receipts);
 for(const signer of [f.deployer,f.b]){await receipt(as(f.token,signer).approve(treasury.target,parseEther('100')),'approve exactly one hundred',f.receipts);await receipt(as(treasury,signer).fund(parseEther('100')),'fund reward pool',f.receipts);}
 const domain=survivalVaultDomain(31337n,String(vault.target));
 const entry=async(label:string,patch:Partial<SurvivalEntry>={}):Promise<SurvivalEntry>=>({runId:id(label),player:f.a.address,currency:String(f.token.target),rulesHash:rules,segment:1n,sequence:0n,deposit:parseEther('40'),stationReserve:parseEther('24'),bonusReserve:parseEther('6'),carryCap:0n,nonce:await vault.entryNonce(f.a.address),expiry:await timestamp(provider)+600n,...patch});
 const signEntry=(e:SurvivalEntry,d=domain)=>f.authority.signTypedData(d,survivalEntryTypes,e);
 const open=async(e:SurvivalEntry)=>{if(e.deposit!==0n)await receipt(as(f.token,f.a).approve(vault.target,e.deposit),'exact initial allocation approval',f.receipts);await receipt(as(vault,f.a).open(e,await signEntry(e)),'open funded local segment',f.receipts);};
 const result=async(e:SurvivalEntry,patch:Partial<SurvivalResult>={},target=vault):Promise<SurvivalResult>=>{const r=await target.run(e.runId);return {runId:e.runId,player:e.player,currency:e.currency,rulesHash:e.rulesHash,segment:r.segment,sequence:r.sequence,deposit:r.deposit,stationEarned:parseEther('5'),bonusEarned:0n,spent:0n,failedStake:0n,successMask:0,failureMask:0,abortMask:0,outcome:2,resultHash:id('canonical:'+e.runId+':'+r.segment),expiry:r.deadline,nextStationReserve:0n,nextBonusReserve:0n,...patch};};
 const signResult=(r:SurvivalResult,d=domain)=>f.authority.signTypedData(d,survivalResultTypes,r);
 const settle=async(r:SurvivalResult)=>receipt(as(vault,f.b).settle(r,await signResult(r)),'worker submits without second player approval',f.receipts);
 const mission=async(e:SurvivalEntry,patch:Partial<SurvivalMissionPermit>={}):Promise<SurvivalMissionPermit>=>{const r=await vault.run(e.runId);return {runId:e.runId,missionId:id('mission:'+e.runId+':'+r.segment+':'+r.accepted),player:e.player,currency:e.currency,rulesHash:e.rulesHash,segment:r.segment,sequence:r.sequence,stationEarned:parseEther('5'),spent:0n,successMask:0,failureMask:0,abortMask:0,expiry:r.deadline,...patch};};
 const signMission=(p:SurvivalMissionPermit,d=domain)=>f.authority.signTypedData(d,survivalMissionTypes,p);
 const accept=async(p:SurvivalMissionPermit)=>receipt(as(vault,f.a).acceptMission(p,await signMission(p)),'player explicitly accepts mission',f.receipts);
 const advance=async(seconds:bigint)=>{await at(provider,await timestamp(provider)+seconds);await provider.send('evm_mine',[]);};
 return {...f,treasury,vault,rules,domain,entry,open,result,settle,mission,accept,advance,signEntry,signResult,signMission};
}
