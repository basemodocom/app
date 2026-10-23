# App on Basemodo

This App runs on [Basemodo](https://basemodo.com): one Machine, one web Process, SQLite on a persistent volume, and Basemodo in front signing visitors in. It is TypeScript end to end, run by Bun: Hono serves `/api/*` and the React client built by Vite. The notes feature is an example of every piece working together; replace it with what the Person asked for. Read this file whole before you write anything in the App.

## Layout

- `src/server/` is the web Process. `app.ts` mounts the API (`createApi`) and serves the built client for every other path; `index.ts` starts it.
- `src/server/routes/` holds one file per API resource, each a Hono router mounted in `createApi`.
- `migrations/` holds the SQL that makes the Database's tables, one file per change (`0001_notes.sql`); `src/server/db/schema.ts` describes the same tables for Drizzle's queries.
- `src/server/identity.ts` says who is visiting.
- `src/client/` is the React app: `app.tsx` lists the pages as routes, `pages/` holds them, `components/ui/` holds the shadcn/ui components, `lib/api.ts` is the typed API client.
- `src/jobs/` holds the scripts Cron runs start.
- `basemodo.toml` is Basemodo's manifest, needed only for Cron runs and workers.

## Changing the App

- **A table or column**: write the SQL in a new migration, `migrations/` with the next number (`0002_add_tags.sql`), then change `schema.ts` to match. The web Process applies each pending migration when it starts, in the order of its number and in a transaction of its own, and records it so it runs once: a Deploy brings the Database up to date by itself, and a migration that fails leaves the Database as it was, and the App does not start, so the Deploy fails. So a migration, once deployed, stays as it is; what it did changes in the next one. Write only its statements: it already runs in a transaction, so one with a `BEGIN` or `COMMIT` of its own is refused.
  - A migration only adds, by default: a table, an index, a column (nullable or with a `DEFAULT`, as SQLite requires of an added column). The Database then still fits the code of earlier Deploys, so going back to one keeps working.
  - To drop or rename something the Person may use (a table, a column, what it holds), first explain to the Person in plain words what goes and what they lose, and ask. Once they say yes, do it in two Deploys: one whose code stops using it, then one whose migration drops it.
- **An API route**: add it to a router in `src/server/routes/` (a new file for a new resource, mounted in `createApi` with `.route()`); put `signedIn` on routers that need a person, and validate input with `zValidator(..., invalid)` so bad input gets a readable 400. Chain the routes on the router (`new Hono().get(...).post(...)`): the chain is what carries their types to the client.
- **A page**: add a component in `src/client/pages/` and a `<Route>` in `app.tsx`. Fetch with TanStack Query through `api` from `lib/api.ts`; a route whose path or shape changes on the server then fails `tsc` in the client.
- **A component**: `bunx shadcn@latest add <name>` puts it in `components/ui/`. Compose screens from these.
- **An App with no pages** (an API, webhooks, scheduled jobs): delete `src/client/`, `vite.config.ts` and `vite build` from the `build` script; the web Process still answers on `$PORT`, which Basemodo requires.
- **Removing the example**: delete `pages/notes.tsx` and its route, `routes/notes.ts` and its mount in `createApi`, `notes.test.ts`, the `Note` type in `lib/api.ts`, the `notes` table in `schema.ts`, `src/jobs/tidy.ts` and the `[[cron]]` comment naming it; point `db/db.test.ts` at your own table. Before the App's first Deploy, delete `migrations/0001_notes.sql` too; once deployed, the table is in the Person's Database, so keep that file and drop the table as dropping goes above.

Write the UI in the Person's language.

## Basemodo's contract

- **The Port Contract**: the web Process listens on `$PORT` on every interface (`0.0.0.0`), as `index.ts` does; its first answer within 60 seconds is the sign it is ready.
- **Data**: the Database is the SQLite file at `$BASEMODO_DB`, on the App's volume (`$BASEMODO_DATA`), which survives every Deploy, restart and Sleep. Everything else on the Machine is replaced at the next Deploy, so keep files there too.
- **Secrets**: `basemodo env set NAME=value`; they arrive as environment variables.

## Who is visiting

Basemodo signs visitors in before they reach the App and sends `X-Basemodo-Id`, `X-Basemodo-Email` and `X-Basemodo-Role` with every request, removing any a visitor sends, so the App trusts them as they are and leaves login to Basemodo. `identify` puts the visitor in `c.var.person`; keep records under `person.id`, which survives an email change. Verify `X-Basemodo-Jwt` with `BASEMODO_JWT_PUBLIC_KEY` only when passing the identity on to another service.

That trust is load-bearing: the whole identity rests on Basemodo being the only way in and stripping these headers, so a request that reached the App's port directly could set `X-Basemodo-Id` to anyone. Basemodo is that single door in production. Where a leak would be grave, make it defense in depth: set the App's `BASEMODO_JWT_PUBLIC_KEY` (PEM) and `identify` verifies the signed `X-Basemodo-Jwt` — a short-lived EdDSA token the gate signs with the App's own key — and trusts the plain headers no longer, so a forged header alone is not enough. The template reads that env var in `index.ts` and passes it to `createApp`; unset, nothing changes.

Locally there is no Basemodo in front: set `DEV_USER_EMAIL` and the server treats every request as that person (only off Basemodo, outside production).

## Hardening

`createApp` wraps every response in three Hono middlewares, so routes and client both get them:

- `secureHeaders({ xFrameOptions: "DENY" })` — no framing (clickjacking), no MIME sniffing, HSTS, a bare `Referrer-Policy`. To add a Content-Security-Policy, first move the inline theme script in `src/client/index.html` to its own file (a strict CSP blocks inline scripts), then pass `contentSecurityPolicy` to `secureHeaders`.
- `csrf()` — a state-changing request that is neither same-origin nor a JSON body is turned away, so a cross-site `<form>` cannot act as the visitor. The client's own `fetch` calls are same-origin and pass; a route that must take a cross-origin write (a webhook) mounts before these middlewares or sets its own `origin`.
- `bodyLimit` — a request body over 64 KB gets a 413 before any route reads it, so one visitor cannot fill the Machine's memory. A route that takes more (a file upload) is left out of it with `except` from `hono/combine` and sets its own `bodyLimit`, since the shared one runs first.

Two more, per feature:

- **Signed identity** — set `BASEMODO_JWT_PUBLIC_KEY` and `identify` trusts only the signed `X-Basemodo-Jwt` (see *Who is visiting*). Do this for any App holding money, PII or one tenant's data another must not read.
- **Rate limit** — `rateLimit` (`src/server/rate-limit.ts`) refuses a key more than `limit` calls a window with a 429. Once a Person is known, key on `person.id`, as the notes router does (`PER_MINUTE` calls a minute): people behind one address (an office, a phone carrier) then keep counts of their own. Before a Person is known (a Public App's waitlist or contact form), key on `byAddress`, which reads `X-Forwarded-For`: Basemodo sets it to the one address the request came from, after removing any the visitor sent. For a Caller (another of the Owner's Apps calling this one), `X-Forwarded-For` holds the calling App's internal address, so its calls count together; tell Callers apart by `X-Basemodo-Caller`, since that address may change with each Deploy. Tune the numbers to the real feature. The count lives in memory: exact on Basemodo's single Process while the App runs, reset when it sleeps; count in the Database for a limit that must outlast a sleep.

Validate every input at the edge with `zValidator` as the routes do, and scope each query by `person.id` so one visitor never reads or writes another's rows.

## What the Machine allows

- **Memory**: the smallest Plan gives the Machine 256 MB, and this App idles near 50 MB. Keep it under 100 MB: prefer small libraries, and do large work in Cron runs.
- **Sleep**: after 10 minutes without requests the App stops, and the next request wakes it in a few seconds; keep state in the Database.
- **Real time**: stream with Server-Sent Events, which Basemodo passes through as they are written, or poll with TanStack Query's `refetchInterval`; WebSockets do not reach the App. With Hono:

  ```ts
  import { streamSSE } from "hono/streaming";

  .get("/events", (c) =>
    streamSSE(c, async (stream) => {
      while (!stream.aborted) {
        await stream.writeSSE({ data: JSON.stringify({ at: Date.now() }) });
        await stream.sleep(5000);
      }
    }),
  )
  ```

  In the browser, `new EventSource("/api/<router>/events")`.
- **Scheduled work**: add a `[[cron]]` in `basemodo.toml` running a script in `src/jobs/` (see the commented example); it wakes the App, opens the same Database with `openDatabase`, and works on every Plan. A `[[worker]]` runs continuously, keeps the App awake and needs the Pro Plan: keep it for work that must run all the time.

## Before deploying

Run `bun run check` and fix what it reports. `bun run build`, which Basemodo runs for every Deploy, typechecks and runs the tests before it builds the client, so a type error or a failing test fails the Deploy. The tests run on an in-memory Database with every migration applied, so a broken migration fails it too. Add a test in `src/server/` for each API route you add, calling `createApp(...).request()` on an in-memory Database as `notes.test.ts` does. Then deploy the folder with `basemodo deploy` (or the local MCP's `deploy`), or, through the Remote MCP, push it to a repository and deploy that with `repository`; give the Person the App's URL. A repository is optional: recommend one (GitHub by default) for the code's history.
