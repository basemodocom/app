import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db";
import { notes } from "../db/schema";
import { type Identity, type Person, signedIn } from "../identity";
import { invalid } from "../invalid";

const newNote = z.object({ text: z.string().trim().min(1, "Write something first").max(2000) });
const noteId = z.object({ id: z.coerce.number().int().positive() });

/** A signed-in visitor's own notes: list, add, delete. */
export function notesRoutes(db: Db, standIn?: Person) {
  return new Hono<Identity>()
    .use(signedIn(standIn))
    .get("/", (c) => {
      const mine = db
        .select()
        .from(notes)
        .where(eq(notes.personId, c.var.person.id))
        .orderBy(desc(notes.id))
        .all();
      return c.json(mine);
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
