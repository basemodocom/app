import { lt, sql } from "drizzle-orm";
import { databasePath, openDatabase } from "../server/db";
import { notes } from "../server/db/schema";

// An example job for a [[cron]] entry in basemodo.toml: forget notes older than
// a year. It opens the same Database as the web Process.
const db = openDatabase(databasePath());
const gone = db
  .delete(notes)
  .where(lt(notes.createdAt, sql`unixepoch() - 365 * 86400`))
  .returning()
  .all();
console.log(`Forgot ${gone.length} old notes`);
