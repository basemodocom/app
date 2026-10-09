import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { databasePath, migrate, openDatabase } from "./db";
import type { Person } from "./identity";

// Locally there is no Basemodo in front to say who is visiting: DEV_USER_EMAIL
// stands in for a signed-in visitor. Only off Basemodo (no BASEMODO_DB) and
// outside production, so an anonymous visitor of a Public App never gets it.
const local = !process.env.BASEMODO_DB && process.env.NODE_ENV !== "production";
const devEmail = local ? process.env.DEV_USER_EMAIL : undefined;
const standIn: Person | undefined = devEmail
  ? { id: `dev:${devEmail}`, email: devEmail, role: "owner" }
  : undefined;

const app = createApp({
  client: fileURLToPath(new URL("../../dist/client", import.meta.url)),
  db: migrate(openDatabase(databasePath())),
  standIn,
});

// The Port Contract: listen on $PORT, on every interface. Basemodo sets PORT;
// locally it defaults to 3000, where Vite's dev server sends /api.
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`Listening on ${server.url}`);
