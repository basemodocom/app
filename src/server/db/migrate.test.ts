import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDatabase } from ".";

const root = mkdtempSync(join(tmpdir(), "migrations-"));
afterAll(() => rmSync(root, { recursive: true }));

// A migrations folder holding `files`, as an agent would write them.
function folder(files: Record<string, string>) {
  const dir = mkdtempSync(join(root, "m-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

// Every folder below starts with this migration.
const FIRST =
  "create table steps (name text not null);\ninsert into steps (name) values ('first');";

function steps(db: ReturnType<typeof openDatabase>) {
  return db.$client.query("select name from steps order by rowid").values().flat();
}

test("migrations apply in the order of their numbers", () => {
  const dir = folder({
    "0010_third.sql": "insert into steps (name) values ('third');",
    "0001_first.sql": FIRST,
    "0002_second.sql": "insert into steps (name) values ('second');",
  });

  const db = migrate(openDatabase(":memory:"), dir);

  expect(steps(db)).toEqual(["first", "second", "third"]);
});

test("a migration applied once is not applied again, and a new one is", () => {
  const dir = folder({ "0001_first.sql": FIRST });
  const db = migrate(openDatabase(":memory:"), dir);

  migrate(db, dir);
  writeFileSync(join(dir, "0002_second.sql"), "insert into steps (name) values ('second');");
  migrate(db, dir);

  expect(steps(db)).toEqual(["first", "second"]);
});

test("a failing migration leaves the Database as it was, and applies once fixed", () => {
  const dir = folder({
    "0001_first.sql": FIRST,
    "0002_broken.sql":
      "insert into steps (name) values ('half');\ncreate table extra (x integer);\ninsert into nowhere values (1);",
  });
  const db = openDatabase(":memory:");

  expect(() => migrate(db, dir)).toThrow(/0002_broken\.sql.*no such table: nowhere/);
  expect(steps(db)).toEqual(["first"]);

  writeFileSync(
    join(dir, "0002_broken.sql"),
    "insert into steps (name) values ('fixed');\ncreate table extra (x integer);",
  );
  migrate(db, dir);
  expect(steps(db)).toEqual(["first", "fixed"]);
});

test("a file that is not named NNNN_name.sql, or reuses a number, is refused", () => {
  for (const name of ["0002-second.sql", "2_second.sql", "0002_second.SQL", "0002_second"]) {
    const dir = folder({
      "0001_first.sql": "create table steps (name text not null);",
      [name]: "select 1;",
    });
    expect(() => migrate(openDatabase(":memory:"), dir)).toThrow(`${name} is not named`);
  }
  const twice = folder({ "0001_first.sql": "select 1;", "0001_again.sql": "select 1;" });
  expect(() => migrate(openDatabase(":memory:"), twice)).toThrow(
    "0001_again.sql and 0001_first.sql",
  );
});

test("hidden files a computer leaves in the folder are ignored", () => {
  const dir = folder({
    "0001_first.sql": "create table steps (name text not null);",
    ".DS_Store": "",
  });
  expect(steps(migrate(openDatabase(":memory:"), dir))).toEqual([]);
});

test("with no migrations folder, as git leaves one emptied, nothing is applied", () => {
  expect(() => migrate(openDatabase(":memory:"), join(root, "none"))).not.toThrow();
});
