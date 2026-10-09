import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof openDatabase>;

/** Where the Database lives: on Basemodo, the App's volume; locally, ./data. */
export function databasePath() {
  return process.env.BASEMODO_DB ?? "./data/app.db";
}

/**
 * Opens the SQLite Database at `path` (":memory:" for tests) and brings it up to
 * date with the migrations in drizzle/. Only the web Process calls this at
 * start; a Cron run opens the same file with `openDatabase` too, after it.
 */
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  // The web Process, Cron runs and `basemodo db` share this file: WAL lets them
  // read while one writes, and a writer waits for the lock instead of failing.
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: new URL("../../../drizzle", import.meta.url).pathname });
  return db;
}
