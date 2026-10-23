import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from ".";

const MIGRATIONS = fileURLToPath(new URL("../../../migrations", import.meta.url));

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
    // One statement at a time: given several, bun:sqlite's run() reports an
    // error only from the last, and would record a migration half applied.
    for (const statement of statements(readFileSync(join(folder, file), "utf8"))) {
      sqlite.run(statement);
    }
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

const WORD = /\w+/y;

// Statements that end or nest the transaction a migration runs in.
const TRANSACTION = new Set(["BEGIN", "COMMIT", "END", "ROLLBACK", "SAVEPOINT", "RELEASE"]);

/**
 * Splits a migration into its statements at each `;` that ends one, as SQLite
 * reads them: not in a string, a quoted name, a comment or a trigger's body.
 */
function statements(sql: string) {
  const found: string[] = [];
  let start = 0;
  let words: string[] = []; // the current statement's first three words
  let body = false; // inside a trigger's BEGIN ... END
  let cases = 0; // CASE expressions open inside that body
  let i = 0;
  const end = () => {
    if (words.length === 0) return;
    if (TRANSACTION.has(words[0] ?? "")) {
      throw new Error(
        `it has a ${words[0]} of its own, and each migration already runs in a transaction: write only its statements`,
      );
    }
    found.push(sql.slice(start, i));
    words = [];
  };
  while (i < sql.length) {
    const c = sql.charAt(i);
    if (c === "-" && sql.charAt(i + 1) === "-") {
      i = sql.indexOf("\n", i) + 1 || sql.length;
    } else if (c === "/" && sql.charAt(i + 1) === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close < 0 ? sql.length : close + 2;
    } else if (c === "'" || c === '"' || c === "`" || c === "[") {
      // A quote inside is written twice ('it''s'), which this reads as two strings.
      i = sql.indexOf(c === "[" ? "]" : c, i + 1) + 1 || sql.length;
    } else if (/[A-Za-z_]/.test(c)) {
      WORD.lastIndex = i;
      const word = WORD.exec(sql)?.[0] ?? c;
      const upper = word.toUpperCase();
      if (words.length === 0) start = i;
      if (words.length < 3) words.push(upper);
      const [first, second, third] = words;
      const trigger =
        first === "CREATE" &&
        (second === "TRIGGER" || (/^TEMP(ORARY)?$/.test(second ?? "") && third === "TRIGGER"));
      if (trigger && !body && upper === "BEGIN") body = true;
      else if (body && upper === "CASE") cases++;
      else if (body && upper === "END") {
        if (cases > 0) cases--;
        else body = false;
      }
      i += word.length;
    } else if (c === ";" && !body) {
      i++;
      end();
    } else {
      if (words.length === 0 && !/\s/.test(c)) {
        start = i;
        words.push(c);
      }
      i++;
    }
  }
  end();
  return found;
}
