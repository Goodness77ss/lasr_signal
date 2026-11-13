import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {id,ZeroAddress} from 'ethers';
import {JourneyDeploymentJournal,type DeploymentRequest,type DeploymentEvidence,type DeploymentVerifier} from '../apps/server/src/journey-deployments.ts';

const collection='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',owner='0x3333333333333333333333333333333333333333',service='0x4444444444444444444444444444444444444444';
const request=(runId='run:1',tokenId='1',address=collection):DeploymentRequest=>({asset:{kind:'soldier',chainId:'31337',collection:address,tokenId},runId,owner,service,leaseId:id(runId+':'+tokenId+':'+address)});
// Explicit trusted adapter fixture: this does not prove an onchain lease or
// owner signature. Contract integration remains behind the owner policy gate.
function fixture(){
  const state={time:'100',block:'10',hash:id('block 10'),fail:false,patch:{} as Partial<DeploymentEvidence>};
  const verifier:DeploymentVerifier={verify:async request=>{
    if(state.fail)throw Error('Chain unavailable');
    return {...request,expiresAt:'200',chainTimestamp:state.time,blockNumber:state.block,blockHash:state.hash,...state.patch};
  }};return {state,verifier};
}

it('fails closed without a chain verifier and rejects mismatched, expired or malformed evidence before writing',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),journal=new JourneyDeploymentJournal(db,f.verifier);
  await expect(new JourneyDeploymentJournal(db).reserve([request()])).rejects.toThrow('adapter required');
  for(const patch of [{owner:other},{service:other},{runId:'run:other'},{leaseId:id('other lease')},{asset:{...request().asset,collection:other}},{expiresAt:'100'},{expiresAt:'0100'},{blockHash:id('0').slice(0,16)}]){
    f.state.patch=patch;await expect(journal.reserve([request()])).rejects.toThrow();expect(journal.current(request().asset)).toBeNull();
  }
  f.state.patch={};f.state.fail=true;await expect(journal.reserve([request()])).rejects.toThrow('Chain unavailable');f.state.fail=false;
  await expect(journal.reserve([])).rejects.toThrow();await expect(journal.reserve([request(),request()])).rejects.toThrow('distinct');
  await expect(journal.reserve([{...request(),owner:ZeroAddress}])).rejects.toThrow();
  await expect(journal.reserve([request(),request('run:2','2')])).rejects.toThrow('One owner');
  expect(db.prepare('SELECT COUNT(*) AS n FROM journey_deployment_leases').get()!.n).toBe(0);
 }finally{db.close();}
});

it('keeps one reservation across simultaneous services, disk reopen and identical retry while separating collection identities',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-deployments-')),file=join(directory,'journal.sqlite');let a=new DatabaseSync(file),b=new DatabaseSync(file);
 try{
  const f=fixture(),first=new JourneyDeploymentJournal(a,f.verifier),second=new JourneyDeploymentJournal(b,f.verifier);
  const results=await Promise.allSettled([first.reserve([request('run:a')]),second.reserve([request('run:b')])]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const saved=first.current(request().asset)!;expect(saved.runId).toBe('run:a');expect(second.current(request().asset)).toEqual(saved);
  expect(await first.reserve([request('run:a')])).toEqual([saved]);expect(first.history(request().asset)).toHaveLength(1);
  await second.reserve([request('run:b','1',other)]);expect(first.current(request('run:b','1',other).asset)!.runId).toBe('run:b');
  a.close();b.close();a=new DatabaseSync(file);b=new DatabaseSync(file);const reopened=new JourneyDeploymentJournal(a,f.verifier);
  expect(reopened.current(request().asset)).toEqual(saved);await expect(reopened.reserve([request('run:c')])).rejects.toThrow('already reserved');
 }finally{a.close();b.close();rmSync(directory,{recursive:true,force:true});}
});

it('rolls back a whole team including an expiry transition when another member conflicts',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),journal=new JourneyDeploymentJournal(db,f.verifier);
  await journal.reserve([request('old','1')]);f.state.patch={expiresAt:'400'};await journal.reserve([request('busy','2')]);
  f.state.time='200';f.state.block='11';f.state.hash=id('block 11');
  await expect(journal.reserve([request('team','1'),request('team','2'),request('team','3')])).rejects.toThrow('already reserved');
  expect(journal.current(request().asset)!.state).toBe('ACTIVE');expect(journal.history(request().asset)).toHaveLength(1);expect(journal.current(request('team','3').asset)).toBeNull();
 }finally{db.close();}
});

it('limits a run to three distinct soldiers across repeated requests and never changes its owner or service',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),journal=new JourneyDeploymentJournal(db,f.verifier);await journal.reserve([request('team','1'),request('team','2')]);await journal.reserve([request('team','3')]);
  await expect(journal.reserve([request('team','4')])).rejects.toThrow('three soldiers');
  await expect(journal.reserve([{...request('team','1'),owner:other}])).rejects.toThrow('cannot change owner');
  expect(journal.forRun('team')).toHaveLength(3);await journal.authorizeRun('team');
 }finally{db.close();}
});

it('accepts a distinct verified lease at exact prior expiry and rejects replay and older or forked observations',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),journal=new JourneyDeploymentJournal(db,f.verifier);await journal.reserve([request('old')]);
  f.state.patch={expiresAt:'300'};f.state.time='199';await expect(journal.reserve([request('new')])).rejects.toThrow('already reserved');
  f.state.time='200';f.state.block='11';f.state.hash=id('block 11');await journal.reserve([request('new')]);
  expect(journal.history(request().asset).map(r=>r.state)).toEqual(['EXPIRED','ACTIVE']);
  f.state.block='10';await expect(journal.reserve([request('new')])).rejects.toThrow('Stale');
  f.state.block='11';f.state.hash=id('different block 11');await expect(journal.reserve([request('new')])).rejects.toThrow('block hash');
  f.state.hash=id('block 11');f.state.time='300';f.state.block='12';f.state.patch={expiresAt:'400'};
  await expect(journal.reserve([request('old')])).rejects.toThrow('cannot be replayed');
  expect(journal.current(request().asset)!.state).toBe('ACTIVE');expect(journal.history(request().asset)).toHaveLength(2);
 }finally{db.close();}
});
