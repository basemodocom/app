import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { createApp } from "./app";
import { openDatabase } from "./db";

// A stand-in for dist/client, so the tests need no build.
const client = mkdtempSync(join(tmpdir(), "client-"));
const page = "<!doctype html><div id=root></div>";
writeFileSync(join(client, "index.html"), page);
writeFileSync(join(client, "index.html.br"), brotliCompressSync(page));
afterAll(() => rmSync(client, { recursive: true }));

const app = createApp({ client, db: openDatabase(":memory:") });

describe("the server", () => {
  test("answers the API", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("answers an unknown API path with a JSON 404", async () => {
    const res = await app.request("/api/nothing-here");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("answers a client route with the client's page", async () => {
    const res = await app.request("/notes/42");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(page);
  });

  test("sends the precompressed page when the browser accepts it", async () => {
    const res = await app.request("/", { headers: { "accept-encoding": "br, gzip" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("br");
  });
});
