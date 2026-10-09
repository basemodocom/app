import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression, defineAlgorithm } from "vite-plugin-compression2";

// The client lives in src/client and builds to dist/client, which the Hono
// server serves. Every asset is also written precompressed (.br, .gz): the
// Basemodo gate does not compress, so the server sends these as they are.
export default defineConfig({
  root: "src/client",
  plugins: [
    react(),
    tailwindcss(),
    compression({
      algorithms: [defineAlgorithm("brotliCompress"), defineAlgorithm("gzip")],
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": `http://localhost:${process.env.PORT ?? 3000}` },
  },
});
