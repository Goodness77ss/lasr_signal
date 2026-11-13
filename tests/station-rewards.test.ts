import {describe,test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Wallet} from 'ethers';
import {REWARD_SURVIVAL_RULES as R,command,distance,SURVIVAL_PROTOCOL,type Game} from '@last-signal/sim';
import {createStationPractice,stepStationPractice} from '../packages/sim/src/survival.ts';
import {createDirector,stepDirector,type Assault} from '../packages/sim/src/assault-director.ts';
import {createRewardState,stationRewards,rewardKey,type StationReward} from '../packages/sim/src/station-rewards.ts';
import {StationRewardStore} from '../apps/server/src/station-reward-store.ts';
import {SurvivalPractice} from '../apps/server/src/survival.ts';
import {WalletAuth} from '../apps/server/src/wallet-auth.ts';

function fixture(owned=false,budget={remainingWhole:200},run='fixture'){
  const game=createStationPractice();game.countdown=0;game.squads=game.squads.filter(s=>s.side===0);
  if(owned)for(const s of game.relays)s.owner=0;
  const d=createDirector(run,R.director!),state=createRewardState(game),journal:StationReward[]=[];
  const reward=()=>stationRewards(game,d,state,R,budget,e=>journal.push(e));
  const tick=(n=1)=>{for(let i=0;i<n;i++){game.tick++;reward();}};
  function assault(station='A'){
    const target=game.relays.find(s=>s.id===station)!;
    const prototype=createStationPractice().squads[1];
    const members=[0,1].map(i=>{const id=game.nextId++;game.squads.push({...structuredClone(prototype),id,x:40,z:5+i*4,route:[{x:target.x+1,z:target.z}]});return {id,last:{x:40,z:5+i*4},progressAt:game.tick+1,stalledAt:null,repathed:false,entered:false};});
    const a:Assault={id:run+':assault:'+ ++d.sequence,station,tier:1,state:'active',createdAt:game.tick,readyAt:game.tick+1,startedAt:game.tick+1,endedAt:null,origins:[{x:40,z:5},{x:40,z:9}],members,engagedAt:null,participated:false,heldFrom:game.tick+1,eligible:true,reason:'test evidence fixture'};
    d.assaults.push(a);tick();return a;
  }
  function defeat(a:Assault){a.members[0].entered=true;a.engagedAt=game.tick;a.participated=true;a.state='defeated';a.endedAt=game.tick;const ids=new Set(a.members.map(m=>m.id));game.squads=game.squads.filter(s=>!ids.has(s.id));}
  return {game,d,state,journal,budget,reward,tick,assault,defeat};
}
describe('simulated station eligibility',()=>{
  test('one five unit capture, no repeat recapture and no client event trigger',()=>{
    const f=fixture();f.game.events.push({seq:1,tick:1,kind:'StationCapturedV2',side:0,to:f.game.relays[0]});f.tick();expect(f.journal).toHaveLength(0);
    f.game.relays[0].owner=0;f.tick();expect(f.journal.map(e=>e.amountWhole)).toEqual([5]);
    f.reward();f.game.relays[0].owner=1;f.tick();f.game.relays[0].owner=0;f.tick();expect(f.journal).toHaveLength(1);expect(f.state.reasons.A).toContain('already resolved');
  });
  test('no passive income and carried recapture requires a fresh assault',()=>{
    const f=fixture(true);f.tick(6000);expect(f.journal).toHaveLength(0);expect(f.state.cycle).toBe(2);
    f.game.relays[0].owner=1;f.tick();f.game.relays[0].owner=0;f.tick();expect(f.journal).toHaveLength(0);expect(f.state.reasons.A).toContain('Carried');
  });
  test('real defense after twenty seconds earns secure five and defense three once',()=>{
    const f=fixture(true),a=f.assault();f.defeat(a);f.tick(399);expect(f.journal).toHaveLength(0);f.tick();
    expect(f.journal.map(e=>[e.kind,e.amountWhole])).toEqual([['CAPTURE',5],['DEFENSE',3]]);f.tick(100);expect(f.journal).toHaveLength(2);
    expect(new Set(f.journal.map(rewardKey)).size).toBe(2);
  });
  test('living or suppressed attackers block defense, unrelated kills cannot replace them',()=>{
    const f=fixture(true),a=f.assault();a.members[0].entered=true;a.engagedAt=f.game.tick;a.participated=true;f.game.squads[1].suppression=100;
    f.tick(450);expect(f.journal).toHaveLength(0);f.defeat(a);f.tick();expect(f.journal.reduce((n,e)=>n+e.amountWhole,0)).toBe(8);
  });
  test.each(['engagement','participation','route','ownership','death'] as const)('rejects defense without %s proof',missing=>{
    const f=fixture(true),a=f.assault();f.defeat(a);
    if(missing==='engagement'){a.members[0].entered=false;a.engagedAt=null;}
    if(missing==='participation')a.participated=false;
    if(missing==='route')a.eligible=false;
    if(missing==='ownership'){f.game.relays[0].owner=1;f.tick();f.game.relays[0].owner=0;}
    if(missing==='death'){f.game.hero!.alive=false;f.game.result={winner:1,reason:'death'};}
    f.tick(401);expect(f.journal.filter(e=>e.kind==='DEFENSE')).toHaveLength(0);
  });
  test('old assault cannot emit again at the next cycle or after reconnect serialization',()=>{
    const f=fixture(true),a=f.assault();f.defeat(a);f.tick(400);expect(f.journal).toHaveLength(2);
    const saved=JSON.parse(JSON.stringify(f.state));Object.assign(f.state,saved);f.tick(6000);expect(f.journal).toHaveLength(2);
    const fresh=f.assault();f.defeat(fresh);f.tick(400);expect(f.journal).toHaveLength(4);expect(f.journal.at(-1)!.cycle).toBe(2);
  });
  test('cycle, run and cross run identity caps cannot reset by changing segments',()=>{
    const budget={remainingWhole:200};
    function earn(run:string){const f=fixture(true,budget,run);
      for(let cycle=1;cycle<=5;cycle++){
        while(f.state.cycle<cycle)f.tick();
        for(const station of ['A','B','C']){const a=f.assault(station);f.defeat(a);f.tick(400);}
        expect(f.journal.filter(e=>e.cycle===cycle).reduce((n,e)=>n+e.amountWhole,0)).toBeLessThanOrEqual(24);
      }
      f.tick(6000);expect(f.journal.reduce((n,e)=>n+e.amountWhole,0)).toBeLessThanOrEqual(120);return f;
    }
    const first=earn('first'),second=earn('second');expect(first.journal.reduce((n,e)=>n+e.amountWhole,0)).toBe(120);
    expect(second.journal.reduce((n,e)=>n+e.amountWhole,0)).toBe(80);expect(budget.remainingWhole).toBe(0);
  });
  test('a cap denied capture cannot be farmed later by recapturing the same key',()=>{
    const f=fixture(false,{remainingWhole:0});f.game.relays[0].owner=0;f.tick();expect(f.state.reasons.A).toContain('cap');
    f.budget.remainingWhole=200;f.game.relays[0].owner=1;f.tick();f.game.relays[0].owner=0;f.tick();expect(f.journal).toHaveLength(0);
  });
  test('missing ticks fail closed rather than assume uninterrupted ownership',()=>{
    const f=fixture(true);f.assault();f.game.tick+=2;expect(f.reward).toThrow('continuity');
  });
  test('actual director combat produces a qualifying defense with no injected kills',()=>{
    const game=createStationPractice();game.countdown=0;const hero=game.squads[0];hero.x=23;hero.z=7;
    const d=createDirector('combat',R.director!),state=createRewardState(game),events:StationReward[]=[],budget={remainingWhole:200};
    for(let i=0;i<1050&&!game.result;i++){
      const ids=new Set(d.assaults.flatMap(a=>a.members.map(m=>m.id)));
      const target=game.squads.find(s=>ids.has(s.id)&&distance(s,game.relays[0])<=9);
      if(target){const length=distance(hero,target);command(game,{id:'shot:'+i,side:0,kind:'fire',squadId:hero.id,direction:{x:(target.x-hero.x)/length,y:0,z:(target.z-hero.z)/length}});}
      stepStationPractice(game,R);stepDirector(game,d,R);stationRewards(game,d,state,R,budget,e=>events.push(e));
    }
    expect(game.hero!.alive).toBe(true);expect(d.assaults[0].state).toBe('defeated');expect(events.map(e=>e.amountWhole)).toEqual([5,3]);
  });
});

function client(service:SurvivalPractice,identity?:string,resolver?:(s:string)=>string|null,walletSession?:string){
  const messages:any[]=[],peer={send:(raw:string)=>messages.push(JSON.parse(raw)),close:()=>{}},c=service.connect(peer,resolver),versions={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash};
  const send=(m:object)=>c.receive(JSON.stringify({...versions,...m}));send({op:'start',...(identity?{practiceToken:identity}:{}),...(walletSession?{walletSession}: {})});
  return {messages,c,send,session:messages.find(m=>m.op==='session'),versions,last:()=>messages.filter(m=>m.op==='snapshot').at(-1)};
}
function capture(service:SurvivalPractice,c:ReturnType<typeof client>){for(let i=0;i<60;i++)service.tick();c.send({op:'command',id:'go',action:{kind:'move',squadId:1,target:{x:23,z:7}}});for(let i=0;i<330;i++)service.tick();c.send({op:'pause',paused:true});}
describe('durable simulated reward service',()=>{
  test('anonymous identity persists across runs, reconnect keeps one capture, journal matches checkpoint',()=>{
    const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);const a=client(service);capture(service,a);
    expect(a.last().rewardLedger.totalWhole).toBe(5);const session=a.session;a.c.close();service.close();
    service=new SurvivalPractice(db,true);const b=client(service,session.practiceToken);expect(b.last().rewardLedger.rollingRemainingWhole).toBe(195);b.c.close();
    const messages:any[]=[],r=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});
    r.receive(JSON.stringify({...a.versions,op:'resume',run:session.run,token:session.token}));expect(messages.at(-1).rewardLedger.totalWhole).toBe(5);expect(messages.at(-1).rewardLedger.events).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM survival_station_rewards WHERE run=?').get(session.run)!.n).toBe(1);r.close();service.close();db.close();
  });
  test('wallet scope requires existing authenticated login and shares rolling cap across sessions',async()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),auth=new WalletAuth(db,46630),wallet=Wallet.createRandom(),origin='http://127.0.0.1:5174';
    const challenge=auth.challenge(wallet.address,origin),login=auth.verify(challenge.nonce,await wallet.signMessage(challenge.message),origin),resolve=(s:string)=>auth.identify(s,origin);
    const a=client(service,undefined,resolve,login.session);capture(service,a);expect(a.last().rewardLedger.scopeKind).toBe('authenticated wallet');
    const b=client(service,undefined,resolve,login.session);expect(b.last().rewardLedger.rollingRemainingWhole).toBe(195);
    const store=new StationRewardStore(db);
    // Historical validated event fixtures fill the remaining wallet window before a second capture.
    for(let i=0;i<39;i++)store.commit('wallet:'+wallet.address.toLowerCase(),{run:'history:'+i,cycle:1,station:'A',kind:'CAPTURE',amountWhole:5,tick:100,source:'historical fixture'});
    capture(service,b);expect(b.last().rewardLedger.totalWhole).toBe(0);expect(b.last().rewardLedger.rollingRemainingWhole).toBe(0);
    expect(b.last().rewardLedger.stations[0].reason).toContain('cap');
    const bad=client(service,undefined,resolve,'not-a-session');expect(bad.messages.at(-1).reason).toContain('login');
    b.send({op:'RewardEarned',amount:100});expect(b.messages.at(-1).reason).toContain('authoritative');
    a.c.close();b.c.close();bad.c.close();service.close();db.close();
  });
  test('rolling window exact boundary and backwards clock protection',()=>{
    const db=new DatabaseSync(':memory:');let now=100000000;const store=new StationRewardStore(db,()=>now),id=store.identity();
    store.commit(id.scope,{run:'r',cycle:1,station:'A',kind:'CAPTURE',amountWhole:5,tick:100,source:'fixture'});
    expect(()=>store.commit(id.scope,{run:'r',cycle:1,station:'A',kind:'CAPTURE',amountWhole:5,tick:100,source:'fixture'})).toThrow();
    expect(store.remaining(id.scope,R)).toBe(195);now+=86400000-1000;expect(store.remaining(id.scope,R)).toBe(195);now+=1000;expect(store.remaining(id.scope,R)).toBe(200);
    now=99999000;expect(()=>store.remaining(id.scope,R)).toThrow('backwards');db.close();
  });
  test('failed checkpoint rolls back reward and tick; retry commits once',()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),a=client(service);
    db.exec(`CREATE TRIGGER reject_reward_checkpoint BEFORE INSERT ON survival_practice_runs WHEN NEW.state LIKE '%"amountWhole":5%' BEGIN SELECT RAISE(ABORT,'fixture'); END;`);
    capture(service,a);expect(db.prepare('SELECT COUNT(*) AS n FROM survival_station_rewards').get()!.n).toBe(0);expect(a.last().rewardLedger.totalWhole).toBe(0);
    db.exec('DROP TRIGGER reject_reward_checkpoint');a.send({op:'pause',paused:false});service.tick();a.send({op:'pause',paused:true});expect(a.last().rewardLedger.totalWhole).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS n FROM survival_station_rewards').get()!.n).toBe(1);a.c.close();service.close();db.close();
  });
  test('missing reward journal refuses checkpoint recovery instead of resetting balance',()=>{
    const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);const a=client(service);capture(service,a);const session=a.session;a.c.close();service.close();db.exec('DELETE FROM survival_station_rewards');
    service=new SurvivalPractice(db,true);const messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});
    c.receive(JSON.stringify({...a.versions,op:'resume',run:session.run,token:session.token}));expect(messages.at(-1).reason).toContain('credential');c.close();service.close();db.close();
  });
});
