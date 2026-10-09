import { createApp } from "./app";

const app = createApp({ client: "./dist/client" });

// The Port Contract: listen on $PORT, on every interface. Basemodo sets PORT;
// locally it defaults to 3000, where Vite's dev server sends /api.
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`Listening on ${server.url}`);
