import { describe, test, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createStationPractice, stepStationPractice, stepStations, stationFeedback } from '../packages/sim/src/survival.ts';
import { RULES, SURVIVAL_PROTOCOL } from '@last-signal/sim';
import { SurvivalPractice } from '../apps/server/src/survival.ts';
import { buildServer } from '../apps/server/src/app.ts';

function captureFixture() {
  const g=createStationPractice();g.countdown=0;g.squads=g.squads.filter(s=>s.side===0);
  const hero=g.squads[0],r=g.relays[0];hero.x=r.x;hero.z=r.z;hero.route=[];
  return {g,hero,r};
}
describe('V2 station authority and exact ticks',()=>{
  test('neutral and hostile captures take 100 eligible ticks and survive high legacy scores',()=>{
    const {g,r}=captureFixture();
    for(let n=0;n<99;n++)stepStationPractice(g);
    expect(r.owner).toBe(null);expect(r.progress).toBe(99);
    stepStationPractice(g);expect(r.owner).toBe(0);
    r.owner=1;for(let n=0;n<100;n++)stepStationPractice(g);expect(r.owner).toBe(0);
    expect(g.events.filter(e=>e.kind==='StationCapturedV2')).toHaveLength(2);
    g.scores=[999,999];stepStationPractice(g);expect(g.result).toBe(null);expect(g.scores).toEqual([999,999]);expect(g.hero!.tokens).toBe(0);
  });
  test('inclusive radius, departure decay and suppressed eligibility',()=>{
    const {g,hero,r}=captureFixture();hero.x=r.x+3;
    stepStations(g);expect(r.progress).toBe(1);
    hero.x=r.x+3.0001;stepStations(g);expect(r.progress).toBe(0);expect(r.attacker).toBe(null);
    hero.x=r.x;hero.suppression=RULES.suppressionThreshold;
    stepStations(g);expect(r.progress).toBe(0);expect(stationFeedback(g,r)).toContain('Suppressed');
    hero.suppression=0;for(let i=0;i<20;i++)stepStations(g);
    hero.x=4;for(let i=0;i<5;i++)stepStations(g);expect(r.progress).toBe(15);
  });
  test('suppressed hostile still contests, multiple friendly squads do not accelerate',()=>{
    const {g,hero,r}=captureFixture();g.squads.push({...structuredClone(hero),id:99});
    stepStations(g);expect(r.progress).toBe(1);
    const hostile={...structuredClone(hero),id:100,side:1 as const,suppression:100};g.squads.push(hostile);
    stepStations(g);expect(r.contested).toBe(true);expect(r.progress).toBe(1);expect(stationFeedback(g,r)).toContain('Contested');
    hostile.hp=0;stepStations(g);expect(r.contested).toBe(false);expect(r.progress).toBe(2);
  });
  test('actual combat death on final capture tick prevents ownership',()=>{
    const {g,hero,r}=captureFixture(),enemy=structuredClone(createStationPractice().squads[1]);
    hero.hp=1;hero.shotAt=1000;enemy.x=r.x+5;enemy.z=r.z;enemy.shotAt=-100;g.squads.push(enemy);
    r.progress=99;r.attacker=0;stepStationPractice(g);
    expect(g.hero!.alive).toBe(false);expect(g.result?.winner).toBe(1);expect(r.owner).toBe(null);expect(r.progress).toBe(99);
  });
});
describe('server station practice',()=>{
  test('disabled entry cannot migrate or start a run',()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,false),messages:any[]=[];
    try{
      service.connect({send:data=>messages.push(JSON.parse(data)),close:()=>{}}).receive(JSON.stringify({op:'start',protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash}));
      expect(messages.at(-1).reason).toContain('disabled');expect(db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'survival_%'").all()).toHaveLength(0);
    }finally{db.close();}
  });
  test('journal replay, rules pinning, spoof rejection and paused restart',()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),messages:any[]=[];
    const peer={send:(raw:string)=>messages.push(JSON.parse(raw)),close:()=>{}},client=service.connect(peer),versions={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash};
    const send=(message:object)=>client.receive(JSON.stringify({...versions,...message}));
    try{
      send({op:'start'});const session=messages.find(m=>m.op==='session');for(let i=0;i<60;i++)service.tick();
      const move={op:'command',id:'move',action:{kind:'move',squadId:1,target:{x:23,z:7}}};send(move);
      const ack=messages.filter(m=>m.op==='ack').at(-1);expect(ack.ok).toBe(true);send(move);expect(messages.at(-1)).toEqual(ack);
      send({...move,action:{kind:'reload',squadId:1}});expect(messages.at(-1).reason).toContain('replay');
      send({op:'command',id:'spoof',action:{kind:'move',squadId:2,target:{x:23,z:7}}});expect(messages.at(-1).reason).toContain('starter');
      send({op:'StationCaptured',station:'A'});expect(messages.at(-1).reason).toContain('authoritative');
      send({op:'pause',paused:true});const tick=messages.filter(m=>m.op==='snapshot').at(-1).observation.tick;service.tick();
      client.close();service.close();
      const recovered=new SurvivalPractice(db,true),restored:any[]=[];
      const c=recovered.connect({send:raw=>restored.push(JSON.parse(raw)),close:()=>{}});
      c.receive(JSON.stringify({...versions,op:'resume',run:session.run,token:session.token}));
      const snapshot=restored.at(-1);expect(snapshot.paused).toBe(true);expect(snapshot.observation.tick).toBe(tick);expect(snapshot.rulesHash).toBe(versions.rulesHash);
      c.receive(JSON.stringify({...versions,...move}));expect(restored.at(-1)).toEqual(ack);
      recovered.close();
    }finally{db.close();}
  });
  test('HTTP config and WebSocket enforce allowed origins and V2 identity',async()=>{
    const {app}=await buildServer({database:':memory:',manual:true,survival:true});
    try{
      const config=(await app.inject('/survival/config')).json();expect(config.enabled).toBe(true);expect(config.rewards).toBe(false);
      await expect(app.injectWS('/survival',{headers:{origin:'http://evil.example'}})).rejects.toThrow();
      const ws=await app.injectWS('/survival',{headers:{origin:'http://127.0.0.1:5174'}});
      const response=new Promise<any>(resolve=>ws.once('message',raw=>resolve(JSON.parse(raw.toString()))));
      ws.send(JSON.stringify({op:'start',protocol:'private-1',rulesHash:config.rulesHash}));expect((await response).reason).toContain('protocol');ws.close();
    }finally{await app.close();}
  });
});
