# App on Basemodo

This App runs on [Basemodo](https://basemodo.com): one machine, one web Process on `$PORT`, SQLite on a persistent volume, and Basemodo in front signing visitors in. It is TypeScript end to end, run by Bun: Hono serves `/api/*` and the React client built by Vite. The notes feature is an example of every piece working together; replace it with what the Person asked for.

## Layout

- `src/server/` is the web Process. `app.ts` mounts the API (`createApi`) and serves the built client for every other path; `index.ts` starts it.
- `src/server/routes/` holds one file per API resource, each a Hono router mounted in `createApi`.
- `src/server/db/schema.ts` is every table; `drizzle/` holds the migrations generated from it.
- `src/server/identity.ts` says who the visitor is.
- `src/client/` is the React app: `app.tsx` lists the pages as routes, `pages/` holds them, `components/ui/` holds the shadcn/ui components, `lib/api.ts` is the typed API client.
- `src/jobs/` holds scripts that Cron runs start.
- `basemodo.toml` is Basemodo's manifest, needed only for Cron runs and workers.

## Changing the App

- **A table or column**: edit `schema.ts`, run `bun run db:generate`, commit the new file in `drizzle/`. The web Process applies pending migrations when it starts, so a Deploy brings the Database up to date by itself.
- **An API route**: add it to a router in `src/server/routes/` (a new file for a new resource, mounted in `createApi` with `.route()`), and validate input with `zValidator(..., invalid)` so bad input gets a readable 400. Chain the routes on the router (`new Hono().get(...).post(...)`): the chain is what carries their types to the client.
- **A page**: add a component in `src/client/pages/` and a `<Route>` in `app.tsx`. Fetch with TanStack Query through `api` from `lib/api.ts`; a route whose path or shape changes on the server then fails `tsc` in the client.
- **A component**: `bunx shadcn@latest add <name>` puts it in `components/ui/`. Compose screens from these.
- **Removing the example**: delete `pages/notes.tsx` and its route, `routes/notes.ts` and its mount, the `notes` table and `src/jobs/tidy.ts`, then run `bun run db:generate`.

Write the UI in the Person's language.

## Who is visiting

Basemodo signs visitors in before they reach the App and sends `X-Basemodo-Id`, `X-Basemodo-Email` and `X-Basemodo-Role` on every request, removing any a visitor sends, so the App trusts them as they are and never has its own login. Put `signedIn()` on routes that need a person and read `c.var.person`; keep records under `person.id`, which survives an email change. `role` is `owner`, `member` or `editor`, and absent for visitors let in by link, by Workspace or because the App is public. Verify `X-Basemodo-Jwt` with `BASEMODO_JWT_PUBLIC_KEY` only when passing the identity on to another service.

Locally there is no Basemodo in front: set `DEV_USER_EMAIL` and the server treats every request as that person (never in production).

## What the machine allows

- **Memory**: the smallest Plan gives the machine 256 MB, and this App idles near 50 MB. Keep it under 100 MB: prefer small libraries, and keep large work in Cron runs rather than in memory.
- **Sleep**: after 10 minutes without requests the App stops and the next request wakes it in a few seconds, so keep state in the Database or on disk (`$BASEMODO_DATA`), never only in memory.
- **Real time**: WebSockets do not reach the App. Stream with Server-Sent Events (Basemodo streams responses as they are written) or poll with TanStack Query's `refetchInterval`.
- **Scheduled work**: add a `[[cron]]` in `basemodo.toml` running a script in `src/jobs/` (see the commented example); it wakes the App and shares its Database on every Plan. A `[[worker]]` runs continuously, keeps the App from sleeping and needs the Pro Plan; use one only for work that must never stop.
- **Secrets**: `basemodo env set NAME=value`; they arrive as environment variables, never in the code.

## Before deploying

Run `bun run check` (Biome, `tsc`, `bun test`) and fix what it reports; add a test in `src/server/` for each API route you add, calling `createApp(...).request()` on an in-memory Database as `notes.test.ts` does. Then deploy with `basemodo deploy` (or the Basemodo MCP's `deploy` tool) and give the Person the URL it prints.
