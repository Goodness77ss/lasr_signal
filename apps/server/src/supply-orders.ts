import type {DatabaseSync} from 'node:sqlite';
import type {RunEconomy} from '../../../packages/sim/src/run-economy.ts';
import type {FieldState} from '../../../packages/sim/src/field-support.ts';
export class SupplyOrders{
 constructor(private db:DatabaseSync){db.exec('CREATE TABLE IF NOT EXISTS survival_supply_orders(run TEXT,id TEXT,asset TEXT,item TEXT,quoted INTEGER,charged INTEGER,applied INTEGER,reason TEXT,tick INTEGER,PRIMARY KEY(run,id));');}
 record(run:string,id:string,asset:string,item:string,quoted:number,charged:number,applied:boolean,reason:string,tick:number){this.db.prepare('INSERT INTO survival_supply_orders VALUES(?,?,?,?,?,?,?,?,?)').run(run,id,asset,item,quoted,charged,Number(applied),reason,tick);}
 verify(run:string,e:RunEconomy,field:FieldState,initial:number){
  const rows=this.db.prepare('SELECT asset,COALESCE(SUM(charged),0) AS total FROM survival_supply_orders WHERE run=? GROUP BY asset').all(run);
  const sum=(asset:string)=>Number(rows.find(r=>r.asset===asset)?.total??0);
  if(sum('RUN_TWIF')!==e.spentWhole||sum('FIELD_CREDITS')!==initial-field.credits)throw Error('Supply checkpoint differs from applied orders');
 }
 recent(run:string){return this.db.prepare('SELECT id,asset,item,quoted,charged,applied,reason,tick FROM survival_supply_orders WHERE run=? ORDER BY rowid DESC LIMIT 8').all(run);}
}
