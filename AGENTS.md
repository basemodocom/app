# App on Basemodo

This App runs on [Basemodo](https://basemodo.com): one Machine, one web Process, SQLite on a persistent volume, and Basemodo in front signing visitors in. It is TypeScript end to end, run by Bun: Hono serves `/api/*` and the React client built by Vite. The notes feature is an example of every piece working together; replace it with what the Person asked for.

## Layout

- `src/server/` is the web Process. `app.ts` mounts the API (`createApi`) and serves the built client for every other path; `index.ts` starts it.
- `src/server/routes/` holds one file per API resource, each a Hono router mounted in `createApi`.
- `src/server/db/schema.ts` is every table; `drizzle/` holds the migrations generated from it.
- `src/server/identity.ts` says who is visiting.
- `src/client/` is the React app: `app.tsx` lists the pages as routes, `pages/` holds them, `components/ui/` holds the shadcn/ui components, `lib/api.ts` is the typed API client.
- `src/jobs/` holds the scripts Cron runs start.
- `basemodo.toml` is Basemodo's manifest, needed only for Cron runs and workers.

## Changing the App

- **A table or column**: edit `schema.ts`, run `bun run db:generate`, commit the new file in `drizzle/`. The web Process applies pending migrations when it starts, so a Deploy brings the Database up to date by itself.
- **An API route**: add it to a router in `src/server/routes/` (a new file for a new resource, mounted in `createApi` with `.route()`); put `signedIn` on routers that need a person, and validate input with `zValidator(..., invalid)` so bad input gets a readable 400. Chain the routes on the router (`new Hono().get(...).post(...)`): the chain is what carries their types to the client.
- **A page**: add a component in `src/client/pages/` and a `<Route>` in `app.tsx`. Fetch with TanStack Query through `api` from `lib/api.ts`; a route whose path or shape changes on the server then fails `tsc` in the client.
- **A component**: `bunx shadcn@latest add <name>` puts it in `components/ui/`. Compose screens from these.
- **An App with no pages** (an API, webhooks, scheduled jobs): delete `src/client/`, `vite.config.ts` and the `build` script; the web Process still answers on `$PORT`, which Basemodo requires.
- **Removing the example**: delete `pages/notes.tsx` and its route, `routes/notes.ts` and its mount in `createApi`, `notes.test.ts`, the `Note` type in `lib/api.ts`, the `notes` table, `src/jobs/tidy.ts` and the `[[cron]]` comment naming it; point `db/db.test.ts` at your own table; then run `bun run db:generate`.

Write the UI in the Person's language.

## Basemodo's contract

- **The Port Contract**: the web Process listens on `$PORT` on every interface (`0.0.0.0`), as `index.ts` does; its first answer within 60 seconds is the sign it is ready.
- **Data**: the Database is the SQLite file at `$BASEMODO_DB`, on the App's volume (`$BASEMODO_DATA`), which survives every Deploy, restart and Sleep. Everything else on the Machine is replaced at the next Deploy, so keep files there too.
- **Secrets**: `basemodo env set NAME=value`; they arrive as environment variables.

## Who is visiting

Basemodo signs visitors in before they reach the App and sends `X-Basemodo-Id`, `X-Basemodo-Email` and `X-Basemodo-Role` with every request, removing any a visitor sends, so the App trusts them as they are and leaves login to Basemodo. `identify` puts the visitor in `c.var.person`; keep records under `person.id`, which survives an email change. Verify `X-Basemodo-Jwt` with `BASEMODO_JWT_PUBLIC_KEY` only when passing the identity on to another service.

Locally there is no Basemodo in front: set `DEV_USER_EMAIL` and the server treats every request as that person (only off Basemodo, outside production).

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

Run `bun run check` and fix what it reports; add a test in `src/server/` for each API route you add, calling `createApp(...).request()` on an in-memory Database as `notes.test.ts` does. Then deploy with `basemodo deploy` (or the Basemodo MCP's `deploy` tool) and give the Person the URL it prints.
