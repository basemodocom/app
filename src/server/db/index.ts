import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export type Db = ReturnType<typeof openDatabase>;

/** Where the Database lives: on Basemodo, the App's volume; locally, ./data. */
export function databasePath() {
  return process.env.BASEMODO_DB ?? "./data/app.db";
}

/** Opens the SQLite Database at `path` (":memory:" for tests), as it is. */
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  // The web Process, Cron runs and `basemodo db` share this file: WAL lets them
  // read while one writes, and a writer waits for the lock instead of failing.
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA foreign_keys = ON");
  return drizzle({ client: sqlite, schema });
}

const MIGRATIONS = fileURLToPath(new URL("../../../migrations", import.meta.url));

/** The migrations in `folder`, in order; hidden files (.DS_Store) are left out. */
function migrationFiles(folder: string) {
  // Git keeps no empty folder, so an App whose migrations were all removed has none.
  if (!existsSync(folder)) return [];
  const files = readdirSync(folder)
    .filter((file) => !file.startsWith("."))
    .sort();
  files.forEach((file, i) => {
    if (!/^\d{4}_[\w-]+\.sql$/.test(file)) {
      throw new Error(`migrations/${file} is not named NNNN_name.sql, as 0002_add_tags.sql is`);
    }
    const before = files[i - 1];
    if (before?.slice(0, 4) === file.slice(0, 4)) {
      throw new Error(`migrations/${before} and ${file} share the number ${file.slice(0, 4)}`);
    }
  });
  return files;
}

/**
 * Brings the Database up to date with the SQL files in migrations/: applies
 * each one not applied yet, in the order of its number, in a transaction of its
 * own, and records it in _migrations. A migration that fails is rolled back
 * whole and stops here with an error naming it, so the web Process, which does
 * this when it starts (src/server/index.ts), does not start on a half-changed
 * Database. Cron runs and workers only open the Database.
 */
export function migrate(db: Db, folder = MIGRATIONS) {
  const sqlite = db.$client;
  sqlite.run(`create table if not exists _migrations (
    name text primary key,
    applied_at integer not null default (unixepoch())
  )`);
  const applied = sqlite.query("select 1 from _migrations where name = ?");
  const record = sqlite.query("insert into _migrations (name) values (?)");
  const apply = sqlite.transaction((file: string) => {
    if (applied.get(file)) return;
    sqlite.run(readFileSync(join(folder, file), "utf8"));
    record.run(file);
  });
  for (const file of migrationFiles(folder)) {
    try {
      // IMMEDIATE takes the write lock before reading what was applied, so a
      // migration another process applied meanwhile is seen and skipped.
      apply.immediate(file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed, so none of it was applied: ${reason}`, {
        cause: error,
      });
    }
  }
  return db;
}
