import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type NotesDatabase = Database.Database;

const defaultMigrationsDir = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

export function openDatabase(
  databasePath: string,
  migrationsDir = defaultMigrationsDir,
) {
  if (databasePath !== ':memory:')
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') database.pragma('journal_mode = WAL');
  applyMigrations(database, migrationsDir);
  return database;
}

function applyMigrations(
  database: NotesDatabase,
  migrationsDir = defaultMigrationsDir,
) {
  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /^\d+_[a-z0-9_-]+\.sql$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      ) STRICT
    `);
    const applied = database.prepare(
      'SELECT 1 FROM schema_migrations WHERE name = ?',
    );
    const record = database.prepare(
      'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
    );
    for (const name of migrations) {
      if (applied.get(name)) continue;
      database.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
      record.run(name, Date.now());
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
