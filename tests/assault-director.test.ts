import {describe,test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {DIRECTED_SURVIVAL_RULES as R,SURVIVAL_RULES,SURVIVAL_PROTOCOL,pinSurvivalRules,validateSurvivalRules,legal,distance,RULES} from '@last-signal/sim';
import {survivalRulesHash} from '@last-signal/chain';
import {createStationPractice,stepStationPractice} from '../packages/sim/src/survival.ts';
import {createDirector,stepDirector,directorStatus} from '../packages/sim/src/assault-director.ts';
import {SurvivalPractice} from '../apps/server/src/survival.ts';

function fixture(){const game=createStationPractice();game.countdown=0;game.relays[0].owner=0;return {game,d:createDirector('test-run',R.director!)};}
function spawn(){const f=fixture();f.game.tick=500;stepDirector(f.game,f.d,R);f.game.tick=600;stepDirector(f.game,f.d,R);return f;}

describe('bounded station assault director',()=>{
  test('authored spawn routes, warning and exact activation tick',()=>{
    const {game,d}=fixture();game.tick=499;stepDirector(game,d,R);expect(d.assaults).toHaveLength(0);
    game.tick=500;stepDirector(game,d,R);const a=d.assaults[0];expect(a.state).toBe('preparing');expect(a.station).toBe('A');expect(a.members).toHaveLength(0);expect(a.readyAt).toBe(600);
    game.tick=599;stepDirector(game,d,R);expect(game.squads).toHaveLength(2);
    game.tick=600;stepDirector(game,d,R);expect(a.state).toBe('active');expect(a.members).toHaveLength(2);expect(new Set(game.squads.map(s=>s.id)).size).toBe(4);
    expect(game.squads.filter(s=>s.side===1)).toHaveLength(3);
    for(const m of a.members){const s=game.squads.find(s=>s.id===m.id)!;expect(legal(s,1)).toBe(true);expect(distance(s,game.squads[0])).toBeGreaterThanOrEqual(10);expect(s.route.length).toBeGreaterThan(0);expect(s.route.every(p=>legal(p,1))).toBe(true);expect(s.hp).toBe(100);expect(s.weapon).toBe('rifle');}
  });
  test('capacity delays create neither extra nor invisible enemies',()=>{
    const {game,d}=fixture();game.tick=500;stepDirector(game,d,R);
    game.squads.push({...structuredClone(game.squads[1]),id:game.nextId++,x:38,z:16});
    game.tick=600;stepDirector(game,d,R);expect(d.assaults[0].state).toBe('preparing');expect(d.assaults[0].members).toHaveLength(0);expect(d.delayed).toBe(1);expect(d.reason).toContain('capacity');
    expect(game.squads.filter(s=>s.side===1)).toHaveLength(2);
    game.squads=game.squads.filter(s=>s.id!==3);game.tick=700;stepDirector(game,d,R);expect(game.squads.filter(s=>s.side===1)).toHaveLength(3);
    game.tick=5000;stepDirector(game,d,R);expect(game.squads.filter(s=>s.side===1).length).toBeLessThanOrEqual(3);
  });
  test('changed safe approach is telegraphed again before spawning',()=>{
    const {game,d}=fixture();game.tick=500;stepDirector(game,d,R);
    const first=d.assaults[0].origins[0];game.squads[0].x=first.x;game.squads[0].z=first.z;
    game.tick=600;stepDirector(game,d,R);expect(d.assaults[0].members).toHaveLength(0);expect(d.assaults[0].readyAt).toBe(700);expect(d.reason).toContain('renewed');
    game.tick=700;stepDirector(game,d,R);expect(d.assaults[0].members).toHaveLength(2);
    expect(game.squads.filter(s=>s.side===1).every(s=>s.id===2||distance(s,game.squads[0])>=10)).toBe(true);
  });
  test('real assigned attackers enter the station zone and can capture friendly ground',()=>{
    const {game,d}=spawn();
    for(let i=0;i<350;i++){stepStationPractice(game,R);stepDirector(game,d,R);}
    const a=d.assaults[0];expect(a.engagedAt).not.toBe(null);expect(a.members.some(m=>m.entered)).toBe(true);expect(a.state).toBe('captured');expect(game.relays[0].owner).toBe(1);expect(a.participated).toBe(false);expect(game.result).toBe(null);
  });
  test('all stations lost still permits gameplay and a new legal assault',()=>{
    const {game,d}=fixture();for(const r of game.relays)r.owner=1;
    game.squads[0].x=24;game.squads[0].z=7;
    for(let i=0;i<100;i++){stepStationPractice(game,R);stepDirector(game,d,R);}
    expect(game.relays[0].owner).toBe(0);expect(game.result).toBe(null);
    for(const r of game.relays)r.owner=1;
    game.tick=500;stepDirector(game,d,R);game.tick=600;stepDirector(game,d,R);game.tick=601;stepDirector(game,d,R);
    expect(d.assaults[0].state).toBe('active');expect(game.result).toBe(null);expect(game.hero!.alive).toBe(true);
  });
  test('only assigned casualties resolve an assault and a new ID never reuses an old one',()=>{
    const {game,d}=spawn(),a=d.assaults[0];game.squads=game.squads.filter(s=>s.id!==2);game.tick++;stepDirector(game,d,R);expect(a.state).toBe('active');
    const ids=new Set(a.members.map(m=>m.id));game.squads=game.squads.filter(s=>!ids.has(s.id));game.tick++;stepDirector(game,d,R);expect(a.state).toBe('defeated');expect(a.engagedAt).toBe(null);expect(a.participated).toBe(false);
    game.tick=d.nextAt;stepDirector(game,d,R);expect(d.assaults[1].id).not.toBe(a.id);expect(d.sequence).toBe(2);
  });
  test('stuck attackers replan then expire without loot or valid defense evidence',()=>{
    const {game,d}=spawn(),a=d.assaults[0];for(const s of game.squads)s.route=[];
    game.tick=801;stepDirector(game,d,R);expect(a.eligible).toBe(false);expect(a.members.every(m=>m.repathed)).toBe(true);expect(a.reason).toContain('Stalled');
    for(const s of game.squads)s.route=[];game.tick=1201;stepDirector(game,d,R);
    expect(a.state).toBe('invalid');expect(game.loot).toHaveLength(0);expect(game.squads.filter(s=>s.side===1)).toHaveLength(1);
  });
  test('tier uses active ticks only, changes approach and composition with bounded stats',()=>{
    const low=fixture(),rich=fixture();rich.game.hero!.tokens=1000000;
    low.game.tick=rich.game.tick=120*RULES.ticks;stepDirector(low.game,low.d,R);stepDirector(rich.game,rich.d,R);
    expect(low.d).toEqual(rich.d);expect(low.d.tier).toBe(2);
    low.game.tick=low.d.assaults[0].readyAt;stepDirector(low.game,low.d,R);expect(low.game.squads.every(s=>s.hp===100)).toBe(true);
    low.game.tick=999999;stepDirector(low.game,low.d,R);expect(directorStatus(low.game,low.d,R.director!).tier).toBe(6);
    const ended=fixture();ended.game.tick=500;ended.game.result={winner:1,reason:'death'};stepDirector(ended.game,ended.d,R);expect(ended.d.sequence).toBe(0);
  });
  test('serialized preparation and active state replay identically',()=>{
    const {game,d}=fixture();game.tick=500;stepDirector(game,d,R);const copy=JSON.parse(JSON.stringify({game,d}));
    for(let i=0;i<180;i++){stepStationPractice(game,R);stepDirector(game,d,R);stepStationPractice(copy.game,R);stepDirector(copy.game,copy.d,R);}
    expect(copy).toEqual({game,d});
  });
});

describe('versioned director recovery',()=>{
  test('rules hash binds population and disallows unmeasured bounds',()=>{
    const copy=structuredClone(R) as any;copy.director.maxEnemies=2;expect(survivalRulesHash(copy)).not.toBe(survivalRulesHash(R));copy.director.maxEnemies=12;expect(()=>validateSurvivalRules(copy)).toThrow('population');
    expect(Object.isFrozen(pinSurvivalRules(R).director!.spawnZones)).toBe(true);
    copy.director.maxEnemies=3;copy.director.preparationSeconds=0;expect(()=>validateSurvivalRules(copy)).toThrow();
  });
  test('Step 3 checkpoint resumes under its original hash without adding a director',()=>{
    const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);service.close();
    const rules=pinSurvivalRules({...SURVIVAL_RULES,flags:{...SURVIVAL_RULES.flags,stations:true}}),hash=survivalRulesHash(rules),token='a'.repeat(64),digest=(s:string)=>createHash('sha256').update(s).digest('hex');
    const saved={id:'legacy',tokenHash:digest(token),rules,rulesHash:hash,protocol:SURVIVAL_PROTOCOL,game:createStationPractice(),paused:true,order:0};const raw=JSON.stringify(saved);
    db.prepare('INSERT INTO survival_practice_runs VALUES(?,?,?)').run(saved.id,raw,digest(raw));service=new SurvivalPractice(db,true);const messages:any[]=[];
    try{
      const client=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});
      client.receive(JSON.stringify({op:'resume',run:saved.id,token,protocol:SURVIVAL_PROTOCOL,rulesHash:hash}));
      const snap=messages.at(-1);expect(snap.rulesHash).toBe(hash);expect(snap.rulesVersion).toBe('survival-2.0.0');expect(snap.director).toBe(false);expect(snap.pressure).toBe(null);
    }finally{service.close();db.close();}
  });
  test('prepared assault ID and countdown survive service restart and paused recovery',()=>{
    const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);const messages:any[]=[];
    const peer={send:(raw:string)=>messages.push(JSON.parse(raw)),close:()=>{}};
    let client=service.connect(peer);const versions={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash};
    client.receive(JSON.stringify({...versions,op:'start'}));const session=messages.find(m=>m.op==='session');
    for(let i=0;i<60+501;i++)service.tick();
    client.receive(JSON.stringify({...versions,op:'pause',paused:true}));const before=messages.at(-1);expect(before.pressure.assault.state).toBe('preparing');client.close();service.close();
    service=new SurvivalPractice(db,true);client=service.connect(peer);
    client.receive(JSON.stringify({...versions,op:'resume',run:session.run,token:session.token}));
    expect(messages.at(-1).pressure).toEqual(before.pressure);expect(messages.at(-1).paused).toBe(true);
    client.close();service.close();db.close();
  });
});
