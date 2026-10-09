import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDatabase } from ".";
import { notes } from "./schema";

const dir = mkdtempSync(join(tmpdir(), "db-"));
afterAll(() => rmSync(dir, { recursive: true }));

test("a restart keeps the data and applies no migration twice", () => {
  const path = join(dir, "nested", "app.db");
  migrate(openDatabase(path)).insert(notes).values({ personId: "p_ana", text: "Kept" }).run();

  const again = migrate(openDatabase(path));

  expect(again.select().from(notes).all()).toMatchObject([{ text: "Kept" }]);
  const applied = again.$client.query("select count(*) as n from __drizzle_migrations").get();
  expect(applied).toEqual({ n: 1 });
});

test("opening the Database alone, as a Cron run does, applies no migration", () => {
  const db = openDatabase(join(dir, "fresh.db"));
  const tables = db.$client.query("select name from sqlite_master where type = 'table'").all();
  expect(tables).not.toContainEqual({ name: "notes" });
});
