import { createApp } from "./app";
import { databasePath, openDatabase } from "./db";
import type { Person } from "./identity";

// Locally there is no Basemodo gate to say who is visiting: DEV_USER_EMAIL
// stands in for a signed-in visitor. Never in production.
const devEmail = process.env.NODE_ENV === "production" ? undefined : process.env.DEV_USER_EMAIL;
const standIn: Person | undefined = devEmail
  ? { id: `dev:${devEmail}`, email: devEmail, role: "owner" }
  : undefined;

const app = createApp({
  client: "./dist/client",
  db: openDatabase(databasePath()),
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
