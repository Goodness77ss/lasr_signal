import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { backupDatabase } from './backup-database.mjs';

test('online backup restores committed WAL rows and leaves the live database intact', async () => {
  const root=mkdtempSync(resolve(tmpdir(),'last-signal-backup-')),source=resolve(root,'source.sqlite');
  const db=new DatabaseSync(source);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE records(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO records VALUES(1,'private fixture');");
    const {directory,report}=await backupDatabase(source,resolve(root,'backups'));
    assert.equal(report.restore,'PASS');assert.deepEqual(report.tables,[{name:'records',rows:1}]);
    const restored=new DatabaseSync(resolve(directory,'restore-check.sqlite'),{readOnly:true});
    try{assert.equal(restored.prepare('SELECT value FROM records').get().value,'private fixture');}finally{restored.close();}
    assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,1);
    assert(!readFileSync(resolve(directory,'verification.json'),'utf8').includes('private fixture'));
    await assert.rejects(backupDatabase(resolve(root,'missing.sqlite'),resolve(root,'backups')));
  } finally { db.close(); }
});
