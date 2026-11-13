import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function inspect(db) {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw Error('Database integrity check failed');
  const tables = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(({ name, sql }) => {
    const identifier = '"' + name.replaceAll('"', '""') + '"';
    const statement = db.prepare('SELECT * FROM ' + identifier);
    statement.setReadBigInts(true);
    const rows = statement.all().map(row => JSON.stringify(row, (_key, value) => typeof value === 'bigint' ? value.toString() : value)).sort();
    return { name, rows: rows.length, digest: createHash('sha256').update(JSON.stringify({ sql, rows })).digest('hex') };
  });
}

// SQLite's online backup includes committed WAL state without copying a live file.
// All restored data remains inside the private ignored directory. Never print rows.
export async function backupDatabase(sourcePath, privateRoot) {
  const source = realpathSync(sourcePath);
  const root = resolve(privateRoot);
  mkdirSync(root, { recursive: true });
  const directory = resolve(root, new Date().toISOString().replaceAll(':', '') + '-' + crypto.randomUUID());
  const child = relative(root, directory);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Backup target must remain inside the private root');
  mkdirSync(directory, { mode: 0o700 });
  const snapshot = resolve(directory, 'snapshot.sqlite');
  const restored = resolve(directory, 'restore-check.sqlite');
  const live = new DatabaseSync(source, { readOnly: true });
  try { await backup(live, snapshot); } finally { live.close(); }
  const saved = new DatabaseSync(snapshot, { readOnly: true });
  let before;
  try { before = inspect(saved); await backup(saved, restored); } finally { saved.close(); }
  const copy = new DatabaseSync(restored);
  try {
    if (JSON.stringify(inspect(copy)) !== JSON.stringify(before)) throw Error('Restore differs from snapshot');
    copy.exec('BEGIN IMMEDIATE; CREATE TABLE __restore_probe(value INTEGER); INSERT INTO __restore_probe VALUES(1); ROLLBACK;');
    if (JSON.stringify(inspect(copy)) !== JSON.stringify(before)) throw Error('Restore transaction rollback failed');
  } finally { copy.close(); }
  const report = { checkedAt: new Date().toISOString(), method: 'node:sqlite online backup', integrity: 'ok', restore: 'PASS', tables: before.map(({ name, rows }) => ({ name, rows })) };
  writeFileSync(resolve(directory, 'verification.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return { directory, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await backupDatabase(process.argv[2] ?? '.runtime/rooms.sqlite', '.runtime/backups');
  console.log(JSON.stringify({ directory: relative(process.cwd(), result.directory), ...result.report }, null, 2));
}
