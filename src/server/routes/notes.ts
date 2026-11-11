import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db";
import { notes } from "../db/schema";
import { type Identity, signedIn } from "../identity";
import { invalid } from "../invalid";
import { rateLimit } from "../rate-limit";

const newNote = z.object({ text: z.string().trim().min(1, "Write something first").max(2000) });
const noteId = z.object({ id: z.coerce.number().int().positive() });
const search = z.object({
  q: z.string().trim().max(200, "Search for 200 characters at most").optional(),
});

// The most calls one visitor may make a minute, counted per person. Tune it to
// the real feature; it bounds both abuse and how fast the Database can grow.
const PER_MINUTE = 60;

/** A signed-in visitor's own notes: list (or search with `?q=`), add, delete. */
export function notesRoutes(db: Db) {
  return new Hono<Identity>()
    .use(signedIn)
    .use(rateLimit<Identity>({ limit: PER_MINUTE, windowMs: 60_000, key: (c) => c.var.person.id }))
    .get("/", zValidator("query", search, invalid), (c) => {
      const { q } = c.req.valid("query");
      const mine = db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.personId, c.var.person.id),
            // The notes holding q, ignoring case; instr, unlike LIKE, reads no wildcards in it.
            q ? sql`instr(lower(${notes.text}), lower(${q})) > 0` : undefined,
          ),
        )
        .orderBy(desc(notes.id))
        .all();
      return c.json(mine, 200);
    })
    .post("/", zValidator("json", newNote, invalid), (c) => {
      const { text } = c.req.valid("json");
      const note = db.insert(notes).values({ personId: c.var.person.id, text }).returning().get();
      return c.json(note, 201);
    })
    .delete("/:id", zValidator("param", noteId, invalid), (c) => {
      const { id } = c.req.valid("param");
      const gone = db
        .delete(notes)
        .where(and(eq(notes.id, id), eq(notes.personId, c.var.person.id)))
        .returning()
        .get();
      if (!gone) return c.json({ error: "not_found" }, 404);
      return c.body(null, 204);
    });
}
