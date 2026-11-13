import { describe,it,expect } from 'vitest';
import { generateSection,validateSection,sectionRandom,sectionOrdinal,MAX_SECTION_ORDINAL } from '../packages/sim/src/journey/generator.ts';

describe('bounded deterministic Journey generator',()=>{
  it('reproduces exact geometry and isolates scenery from encounters',()=>{
    const a=generateSection(123,'9');expect(generateSection(123,'9')).toEqual(a);expect(generateSection(124,'9')).not.toEqual(a);
    const stream=sectionRandom(123,'9','encounter'),before=[stream(),stream()];const scenery=sectionRandom(123,'9','scenery');for(let i=0;i<100;i++)scenery();
    const again=sectionRandom(123,'9','encounter');expect([again(),again()]).toEqual(before);
  });
  it('validates ten thousand sections without retaining generated worlds',()=>{
    const templates=new Set<string>(),regions=new Set<string>();let fallback=0;
    for(let i=0;i<10000;i++){const section=generateSection(i%19,String(i));expect(validateSection(section)).toBe(true);expect(section.solids.length).toBeLessThanOrEqual(16);templates.add(section.template);regions.add(section.region);if(section.fallback)fallback++;}
    expect(templates.size).toBe(3);expect(regions.size).toBe(3);expect(fallback).toBe(0);
  });
  it('retries invalid content only three times then uses a known valid template',()=>{
    let attempts=0;
    const section=generateSection(1,'4',()=>{attempts++;return {...generateSection(1,'4'),solids:[{x:0,z:0,w:72,d:48,h:8}]};});
    expect(attempts).toBe(3);expect(section.fallback).toBe(true);expect(validateSection(section)).toBe(true);
  });
  it('keeps exact uint64 ordinals beyond JavaScript safe integers and fails at exhaustion',()=>{
    const ordinal='9007199254740993';expect(generateSection(1,ordinal).ordinal).toBe(ordinal);expect(sectionOrdinal(String(MAX_SECTION_ORDINAL))).toBe(MAX_SECTION_ORDINAL);
    for(const text of ['-1','01','1.5','NaN',String(MAX_SECTION_ORDINAL+1n)])expect(()=>generateSection(1,text)).toThrow();
    expect(()=>generateSection(NaN,'1')).toThrow();
  });
});
