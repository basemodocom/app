import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from ".";
import { notes } from "./schema";

const dir = mkdtempSync(join(tmpdir(), "db-"));
afterAll(() => rmSync(dir, { recursive: true }));

test("a restart keeps the data and does not migrate again", () => {
  const path = join(dir, "nested", "app.db");
  openDatabase(path).insert(notes).values({ personId: "p_ana", text: "Kept" }).run();
  const again = openDatabase(path);
  expect(again.select().from(notes).all()).toMatchObject([{ text: "Kept" }]);
});
