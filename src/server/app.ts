import { Hono } from "hono";
import { serveStatic } from "hono/bun";

// The API. Every route lives under /api; its type (AppType) is what the client
// imports to call it with types.
const api = new Hono().get("/health", (c) => c.json({ ok: true }));

export type AppType = typeof api;

/**
 * The whole server: the API under /api, and the built client (`client`, the
 * folder `bun run build` writes) for every other path.
 */
export function createApp({ client }: { client: string }) {
  return (
    new Hono()
      .route("/api", api)
      // An /api path no route answered is a JSON 404, never the client's page.
      .all("/api/*", (c) => c.json({ error: "not_found" }, 404))
      // The built client, sent precompressed (.br, .gz) when the browser accepts it.
      .use("*", serveStatic({ root: client, precompressed: true }))
      // Any other path is a client route: the client's index.html answers it.
      .get("*", serveStatic({ root: client, path: "index.html", precompressed: true }))
  );
}
