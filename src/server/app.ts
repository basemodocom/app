import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { Db } from "./db";
import { identify, type Person } from "./identity";
import { notesRoutes } from "./routes/notes";

type Options = {
  /** The folder `bun run build` writes the client to. */
  client: string;
  db: Db;
  /** Who to be when no Basemodo is in front: local development only. */
  standIn?: Person;
  /** The App's `BASEMODO_JWT_PUBLIC_KEY` (PEM). Set it to verify `X-Basemodo-Jwt`. */
  jwtPublicKey?: string;
};

/**
 * The largest request body the App reads: 64 KB. The API takes JSON from forms,
 * and the largest body it accepts, a 2000-character note, is at most 12 KB as
 * JSON even with every character escaped; 64 KB leaves room for bigger forms,
 * while many such requests at once stay small next to a 256 MB Machine.
 */
const maxBody = 64 * 1024;

/** The API: every route under /api. Add a route file and mount it here. */
function createApi(db: Db) {
  return new Hono().get("/health", (c) => c.json({ ok: true })).route("/notes", notesRoutes(db));
}

/** What the client imports to call the API with types (src/client/lib/api.ts). */
export type AppType = ReturnType<typeof createApi>;

/** The whole server: the API under /api, and the built client for every other path. */
export function createApp({ client, db, standIn, jwtPublicKey }: Options) {
  return (
    new Hono()
      // Hardening on every response. secureHeaders stops the page being framed
      // (clickjacking) and MIME-sniffed, and sets HSTS and a bare Referrer-Policy;
      // Basemodo terminates TLS so HSTS is honored there, and http://localhost
      // ignores it. To add a Content-Security-Policy, move the inline theme script
      // in src/client/index.html to its own file first, then pass contentSecurityPolicy.
      .use("*", secureHeaders({ xFrameOptions: "DENY" }))
      // csrf refuses a state-changing request (POST/DELETE/…) that is neither
      // same-origin nor JSON: a cross-site <form> or navigation to /api is turned
      // away before a route runs. The client's own calls are same-origin and pass.
      .use("*", csrf())
      // bodyLimit refuses a body over maxBody with a 413 before anything reads it:
      // Basemodo lets a signed-in visitor send up to 100 MB, which parsed whole
      // would fill the Machine's memory. A route that takes more (a file upload)
      // is left out with `except` from hono/combine and sets its own bodyLimit.
      .use(
        "*",
        bodyLimit({
          maxSize: maxBody,
          onError: (c) =>
            c.json(
              {
                error: "too_large",
                message: `The request body is larger than ${maxBody / 1024} KB`,
              },
              413,
            ),
        }),
      )
      .use("/api/*", identify(standIn, jwtPublicKey))
      .route("/api", createApi(db))
      // An /api path no route answered is a JSON 404, never the client's page.
      .all("/api/*", (c) => c.json({ error: "not_found" }, 404))
      // The built client, sent precompressed (.br, .gz) when the browser accepts it.
      .use("*", serveStatic({ root: client, precompressed: true }))
      // A missing file (an asset of an earlier Deploy) is a 404, not the page.
      .get("*", async (c, next) => (/\.\w+$/.test(c.req.path) ? c.notFound() : next()))
      // Any other path is a client route: the client's index.html answers it.
      .get("*", serveStatic({ root: client, path: "index.html", precompressed: true }))
  );
}
