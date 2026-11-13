import { describe,it,expect } from 'vitest';
import { PerspectiveCamera,Vector3 } from 'three';
import { createJourney,journeyLeader,journeyFire,journeyStep,journeyMove,journeyBank,journeyQuit,journeyDrive,journeyReload,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
import { roadWorld,ROAD_SECTION } from '../packages/sim/src/journey/world.ts';
import { FieldCamera } from '../apps/web/src/field-camera.ts';
import { distance } from '@last-signal/sim';

describe('Journey first road encounter',()=>{
  it('wins an actual local combat journey, completes one checkpoint and banks once',async()=>{
    const run=await createJourney(),world=roadWorld(),leader=journeyLeader(run);
    expect(journeyBank(run)).toBe(false);expect(journeyMove(run,ROAD_SECTION.checkpoint,world)).toBe(true);
    let shots=0;
    for(let tick=0;tick<1800&&run.state==='ACTIVE';tick++){
      const target=run.actors.filter(a=>a.side===1&&a.hp>0).sort((a,b)=>distance(leader,a)-distance(leader,b))[0];
      if(target&&distance(leader,target)<run.pin.rules.rifleRange){if(journeyFire(run,leader,{x:target.x-leader.x,y:-.65,z:target.z-leader.z},world))shots++;if(!leader.ammo)journeyReload(run);}
      journeyStep(run,world);
      for(const actor of run.actors)expect(world.walkable(actor)).toBe(true);
    }
    expect(shots).toBeGreaterThan(0);expect(run.actors.filter(a=>a.side===1&&a.hp>0)).toHaveLength(0);expect(leader.hp).toBeGreaterThan(0);
    expect(run.state).toBe('CHECKPOINT_REACHED');expect(run.practiceCredits).toBe(10);
    for(let i=0;i<50;i++)journeyStep(run,world);
    expect(run.practiceCredits).toBe(10);expect(run.events.filter(e=>e.kind==='checkpoint')).toHaveLength(1);
    expect(journeyBank(run)).toBe(true);expect(journeyBank(run)).toBe(false);expect(run.bankedPracticeCredits).toBe(10);expect(run.practiceCredits).toBe(0);
    const before=JSON.stringify(run);journeyStep(run);expect(JSON.stringify(run)).toBe(before);
  });
  it('rejects a blocked shot and move, normalizes drive and consumes actual ammunition',async()=>{
    const run=await createJourney(),leader=journeyLeader(run);Object.assign(leader,{x:12,z:15});Object.assign(run.actors[3],{x:30,z:15});
    expect(journeyMove(run,{x:20,z:15})).toBe(false);
    expect(journeyFire(run,leader,{x:1,y:0,z:0})).toBe(true);expect(run.actors[3].hp).toBe(100);expect(leader.ammo).toBe(19);
    expect(journeyFire(run,leader,{x:1,y:0,z:0})).toBe(false);expect(leader.ammo).toBe(19);
    const before={x:leader.x,z:leader.z};journeyDrive(run,{x:100,z:100});journeyStep(run);expect(distance(before,leader)).toBeCloseTo(run.pin.rules.speed/run.pin.rules.ticks);
    expect(journeyFire(run,leader,{x:NaN,y:0,z:0})).toBe(false);
  });
  it('does not pay for merely reaching the marker and ends on leader death or quit',async()=>{
    const run=await createJourney();Object.assign(journeyLeader(run),ROAD_SECTION.checkpoint);journeyStep(run);expect(run.checkpointComplete).toBe(false);expect(journeyBank(run)).toBe(false);
    journeyLeader(run).hp=0;journeyStep(run);expect(run.state).toBe('DEAD');expect(run.practiceCredits).toBe(0);expect(run.actors[1].hp).toBeGreaterThan(0);
    const second=await createJourney();second.practiceCredits=10;journeyQuit(second);journeyQuit(second);expect(second.state).toBe('QUIT');expect(second.practiceCredits).toBe(0);expect(second.events.filter(e=>e.kind==='quit')).toHaveLength(1);
  });
  it('retains the pinned version in a copied local snapshot and rejects silent upgrades',async()=>{
    const run=await createJourney();await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
    const changed=structuredClone(run);changed.pin.rules={...changed.pin.rules,rifleDamage:changed.pin.rules.rifleDamage+1};await expect(validateJourneyResume(changed)).rejects.toThrow();
  });
  it('keeps camera, picking and independent look in the same metre world',async()=>{
    const run=await createJourney(),camera=new PerspectiveCamera(65,16/9,.1,180),view=new FieldCamera(camera,roadWorld());view.setMode('eyes');
    const direction=view.direction(1,0);view.rotate(Math.PI/2/.0026,0);view.update(journeyLeader(run),.016,true,0);camera.updateMatrixWorld();
    expect(view.direction(1,0)).toEqual(direction);expect(camera.position.x).toBe(7);expect(camera.position.y).toBe(1.8);expect(camera.getWorldDirection(new Vector3()).z).toBeGreaterThan(.99);
    const point=new Vector3(7,1.8,34),screen=point.clone().project(camera),back=screen.clone().unproject(camera);expect(back.distanceTo(point)).toBeLessThan(.00001);
    expect(camera.parent).toBeNull();
  });
});
