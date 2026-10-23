import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The Database's tables, as Drizzle queries them. The SQL that creates them is in
// migrations/: change a table there in a new file, then here to match.

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
