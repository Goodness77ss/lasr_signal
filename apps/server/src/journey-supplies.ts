import type {DatabaseSync} from 'node:sqlite';
import {getAddress} from 'ethers';
export type SupplyRedemption=Readonly<{chainId:'31337';transactionHash:string;logIndex:number;collection:string;owner:string;itemClass:number;packs:string;blockHash:string;confirmed:boolean}>;
export interface SupplyReceiptVerifier {verify(transactionHash:string,logIndex:number):Promise<SupplyRedemption>;canonical?(event:SupplyRedemption):Promise<boolean>}
/** Only checked chain events can credit opened stock. Gameplay integration shares this database. */
export class JourneySupplyJournal {
 constructor(private db:DatabaseSync,private verifier:SupplyReceiptVerifier){db.exec(`
 CREATE TABLE IF NOT EXISTS journey_supply_receipts(source TEXT PRIMARY KEY,event TEXT NOT NULL,status TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS journey_supply_receipts_owner ON journey_supply_receipts(json_extract(event,'$.owner'),status);
 CREATE TABLE IF NOT EXISTS journey_supply_stock(owner TEXT NOT NULL,item_class INTEGER NOT NULL,units TEXT NOT NULL,PRIMARY KEY(owner,item_class));
 CREATE TABLE IF NOT EXISTS journey_supply_uses(run_id TEXT NOT NULL,command_id TEXT NOT NULL,owner TEXT NOT NULL,item_class INTEGER NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(run_id,command_id));
 CREATE TABLE IF NOT EXISTS journey_supply_freezes(owner TEXT PRIMARY KEY,reason TEXT NOT NULL);
 `);}
 private valid(event:SupplyRedemption){
  if(event.chainId!=='31337'||!/^0x[0-9a-fA-F]{64}$/.test(event.transactionHash)||!/^0x[0-9a-fA-F]{64}$/.test(event.blockHash)||!Number.isSafeInteger(event.logIndex)||event.logIndex<0||!Number.isInteger(event.itemClass)||event.itemClass<0||event.itemClass>3||!/^[1-9][0-9]*$/.test(event.packs))throw Error('Invalid supply receipt');
  return {...event,transactionHash:event.transactionHash.toLowerCase(),blockHash:event.blockHash.toLowerCase(),owner:getAddress(event.owner),collection:getAddress(event.collection)};
 }
 balance(owner:string,itemClass:number){const row=this.db.prepare('SELECT units FROM journey_supply_stock WHERE owner=? AND item_class=?').get(getAddress(owner),itemClass);return row?BigInt(String(row.units)):0n;}
 frozen(owner:string){return !!this.db.prepare('SELECT 1 FROM journey_supply_freezes WHERE owner=?').get(getAddress(owner));}
 async recover(transactionHash:string,logIndex:number,expectedOwner?:string){
  const event=this.valid(await this.verifier.verify(transactionHash,logIndex));
  if(event.transactionHash!==transactionHash.toLowerCase()||event.logIndex!==logIndex)throw Error('Receipt identity mismatch');
  if(expectedOwner&&getAddress(expectedOwner)!==event.owner)throw Error('Supply redemption owner mismatch');
  const source=event.chainId+':'+event.transactionHash+':'+event.logIndex;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const prior=this.db.prepare('SELECT event,status FROM journey_supply_receipts WHERE source=?').get(source);
   if(prior){const old=JSON.parse(String(prior.event)) as SupplyRedemption;
    if(old.owner!==event.owner||old.collection!==event.collection||old.itemClass!==event.itemClass||old.packs!==event.packs)throw Error('Redemption event changed');
    if(prior.status==='confirmed'&&(old.blockHash!==event.blockHash||!event.confirmed)){
     this.db.prepare('UPDATE journey_supply_receipts SET status=? WHERE source=?').run('orphaned',source);
     this.db.prepare('INSERT OR REPLACE INTO journey_supply_freezes VALUES(?,?)').run(event.owner,'Confirmed redemption orphaned');
    }else if(prior.status==='pending'&&event.confirmed)this.credit(source,event);
   }else{
    this.db.prepare('INSERT INTO journey_supply_receipts VALUES(?,?,?)').run(source,JSON.stringify(event),'pending');
    if(event.confirmed)this.credit(source,event);
   }
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  return {units:this.balance(event.owner,event.itemClass).toString(),frozen:this.frozen(event.owner)};
 }
 /** Called only within the same writer transaction that persists the accepted gameplay effect. */
 consume(owner:string,itemClass:number,runId:string,commandId:string,fingerprint:string){
  if(!this.db.isTransaction)throw Error('Atomic gameplay transaction required');
  owner=getAddress(owner);
  if(!Number.isInteger(itemClass)||itemClass<0||itemClass>3||!runId||!commandId||!fingerprint)throw Error('Invalid supply use');
  const prior=this.db.prepare('SELECT owner,item_class,fingerprint FROM journey_supply_uses WHERE run_id=? AND command_id=?').get(runId,commandId);
  if(prior){if(prior.owner!==owner||prior.item_class!==itemClass||prior.fingerprint!==fingerprint)throw Error('Supply command changed');return false;}
  if(this.frozen(owner))throw Error('Supply stock frozen for reconciliation');
  const stock=this.balance(owner,itemClass);if(stock<1n)throw Error('No owned supply stock');
  this.db.prepare('UPDATE journey_supply_stock SET units=? WHERE owner=? AND item_class=?').run((stock-1n).toString(),owner,itemClass);
  this.db.prepare('INSERT INTO journey_supply_uses VALUES(?,?,?,?,?)').run(runId,commandId,owner,itemClass,fingerprint);
  return true;
 }
 async reconcile(owner:string){
  owner=getAddress(owner);
  if(!this.verifier.canonical)throw Error('Supply canonical receipt verifier required');
  const rows=this.db.prepare("SELECT source,event FROM journey_supply_receipts WHERE status='confirmed' AND json_extract(event,'$.owner')=?").all(owner);
  for(const row of rows){
   const event=JSON.parse(String(row.event)) as SupplyRedemption;
   if(event.owner!==owner||await this.verifier.canonical(event))continue;
   this.db.exec('BEGIN IMMEDIATE');
   try{
    this.db.prepare("UPDATE journey_supply_receipts SET status='orphaned' WHERE source=? AND status='confirmed'").run(String(row.source));
    this.db.prepare('INSERT OR REPLACE INTO journey_supply_freezes VALUES(?,?)').run(owner,'Confirmed redemption orphaned');
    this.db.exec('COMMIT');
   }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  return {frozen:this.frozen(owner)};
 }
 private credit(source:string,event:SupplyRedemption){
  const units=this.balance(event.owner,event.itemClass)+BigInt(event.packs)*3n;
  this.db.prepare('INSERT INTO journey_supply_stock VALUES(?,?,?) ON CONFLICT(owner,item_class) DO UPDATE SET units=excluded.units').run(event.owner,event.itemClass,units.toString());
  this.db.prepare('UPDATE journey_supply_receipts SET event=?,status=? WHERE source=?').run(JSON.stringify(event),'confirmed',source);
 }
}




