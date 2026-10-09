import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The Database's tables. Change a table here, then `bun run db:generate` writes
// the migration into drizzle/; the server applies it when it next starts.

export const notes = sqliteTable(
  "notes",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    // Whose note: the visitor's X-Basemodo-Id, which stays the same if their email changes.
    personId: text("person_id").notNull(),
    text: text().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index("notes_person_id").on(table.personId)],
);
