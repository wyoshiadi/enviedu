import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(filename, migrationsDir) {
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  if (migrationsDir && existsSync(migrationsDir)) {
    database.exec('CREATE TABLE IF NOT EXISTS _enviedu_migrations (name TEXT PRIMARY KEY)');
    for (const name of readdirSync(migrationsDir).filter(n => n.endsWith('.sql')).sort()) {
      if (database.prepare('SELECT name FROM _enviedu_migrations WHERE name=?').get(name)) continue;
      database.exec('BEGIN IMMEDIATE');
      try { database.exec(readFileSync(path.join(migrationsDir, name), 'utf8')); database.prepare('INSERT INTO _enviedu_migrations (name) VALUES (?)').run(name); database.exec('COMMIT'); }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    }
  }
  function prepare(sql, values = []) {
    const execute = () => {
      const statement = database.prepare(sql), args = values.map(v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: statement.all(...args), meta: { changes: Number(database.prepare('SELECT changes() AS count').get().count) } };
      const result = statement.run(...args); return { results: [], meta: { changes: Number(result.changes) } };
    };
    return { bind(...args) { return prepare(sql, args); }, async first() { return execute().results[0] || null; }, async all() { return execute(); }, async run() { return execute(); }, execute };
  }
  return { prepare, async batch(statements) {
    database.exec('BEGIN IMMEDIATE');
    try { const results = statements.map(s => s.execute()); database.exec('COMMIT'); return results; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }, close() { database.close(); } };
}
