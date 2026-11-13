import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {JourneySupplyJournal,type SupplyRedemption} from './journey-supplies.ts';
test('pending redemption cannot spend, confirmed replay credits once, orphan freezes stock',async()=>{
 const db=new DatabaseSync(':memory:');
 let event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'1'.repeat(64),logIndex:2,collection:'0x'+'2'.repeat(40),owner:'0x'+'3'.repeat(40),itemClass:0,packs:'2',blockHash:'0x'+'4'.repeat(64),confirmed:false};
 const journal=new JourneySupplyJournal(db,{verify:async()=>event});
 try{
  expect((await journal.recover(event.transactionHash,2)).units).toBe('0');
  event={...event,confirmed:true};
  expect((await journal.recover(event.transactionHash,2)).units).toBe('6');
  expect((await journal.recover(event.transactionHash,2)).units).toBe('6');
  event={...event,blockHash:'0x'+'5'.repeat(64)};
  expect(await journal.recover(event.transactionHash,2)).toEqual({units:'6',frozen:true});
  event={...event,packs:'3'};
  await expect(journal.recover(event.transactionHash,2)).rejects.toThrow('event changed');
  expect(journal.balance(event.owner,0)).toBe(6n);
 }finally{db.close();}
});

test('reconciliation fails closed on unavailable RPC without declaring an orphan',async()=>{
 const db=new DatabaseSync(':memory:');
 const event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'1'.repeat(64),logIndex:0,collection:'0x'+'2'.repeat(40),owner:'0x'+'3'.repeat(40),itemClass:1,packs:'1',blockHash:'0x'+'4'.repeat(64),confirmed:true};
 let offline=true;
 const journal=new JourneySupplyJournal(db,{verify:async()=>event,canonical:async()=>{if(offline)throw Error('RPC unavailable');return false;}});
 try{
  await journal.recover(event.transactionHash,0);
  await expect(journal.reconcile(event.owner)).rejects.toThrow('RPC unavailable');
  expect(journal.frozen(event.owner)).toBe(false);
  offline=false;
  expect(await journal.reconcile(event.owner)).toEqual({frozen:true});
  expect(journal.balance(event.owner,1)).toBe(3n);
 }finally{db.close();}
});

test('supply debit shares gameplay rollback, rejects changed replay and prevents a second run spending empty stock',async()=>{
 const db=new DatabaseSync(':memory:');
 const event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'1'.repeat(64),logIndex:0,collection:'0x'+'2'.repeat(40),owner:'0x'+'3'.repeat(40),itemClass:2,packs:'1',blockHash:'0x'+'4'.repeat(64),confirmed:true};
 const journal=new JourneySupplyJournal(db,{verify:async()=>event});
 try{
  await journal.recover(event.transactionHash,0);
  expect(()=>journal.consume(event.owner,2,'run','command','effect')).toThrow('transaction required');
  db.exec('BEGIN IMMEDIATE');journal.consume(event.owner,2,'run','command','effect');db.exec('ROLLBACK');
  expect(journal.balance(event.owner,2)).toBe(3n);
  db.exec('BEGIN IMMEDIATE');
  expect(journal.consume(event.owner,2,'run','command','effect')).toBe(true);
  expect(journal.consume(event.owner,2,'run','command','effect')).toBe(false);
  expect(()=>journal.consume(event.owner,2,'run','command','changed')).toThrow('command changed');
  journal.consume(event.owner,2,'second-run','command','effect');
  journal.consume(event.owner,2,'third-run','command','effect');
  expect(()=>journal.consume(event.owner,2,'fourth-run','command','effect')).toThrow('No owned');
  db.exec('COMMIT');
  expect(journal.balance(event.owner,2)).toBe(0n);
 }finally{db.close();}
});
