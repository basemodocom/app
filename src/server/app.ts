import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Db } from "./db";
import type { Person } from "./identity";
import { notesRoutes } from "./routes/notes";

type Options = {
  /** The folder `bun run build` writes the client to. */
  client: string;
  db: Db;
  /** Who to be when no Basemodo gate is in front: local development only. */
  standIn?: Person;
};

/** The API: every route under /api. Add a route file and mount it here. */
function createApi({ db, standIn }: Options) {
  return new Hono()
    .get("/health", (c) => c.json({ ok: true }))
    .route("/notes", notesRoutes(db, standIn));
}

/** What the client imports to call the API with types (src/client/lib/api.ts). */
export type AppType = ReturnType<typeof createApi>;

/** The whole server: the API under /api, and the built client for every other path. */
export function createApp(options: Options) {
  return (
    new Hono()
      .route("/api", createApi(options))
      // An /api path no route answered is a JSON 404, never the client's page.
      .all("/api/*", (c) => c.json({ error: "not_found" }, 404))
      // The built client, sent precompressed (.br, .gz) when the browser accepts it.
      .use("*", serveStatic({ root: options.client, precompressed: true }))
      // Any other path is a client route: the client's index.html answers it.
      .get("*", serveStatic({ root: options.client, path: "index.html", precompressed: true }))
  );
}
