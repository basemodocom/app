import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { migrate, openDatabase } from "./db";

// Each test gets its own App on a fresh in-memory Database, migrated as at start.
function fresh() {
  return createApp({ client: "./dist/client", db: migrate(openDatabase(":memory:")) });
}

// What the Basemodo gate sends for a signed-in visitor.
const ana = { "x-basemodo-id": "p_ana", "x-basemodo-email": "ana@example.com" };
const ben = { "x-basemodo-id": "p_ben", "x-basemodo-email": "ben@example.com" };

function post(app: ReturnType<typeof fresh>, who: Record<string, string>, body: unknown) {
  return app.request("/api/notes", {
    method: "POST",
    headers: { ...who, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// A real browser sends Sec-Fetch-Site on every request; a same-origin call from
// the client carries "same-origin", which the CSRF guard requires to let a
// DELETE (a request with no JSON body) through.
function del(app: ReturnType<typeof fresh>, who: Record<string, string>, id: number) {
  return app.request(`/api/notes/${id}`, {
    method: "DELETE",
    headers: { ...who, "sec-fetch-site": "same-origin" },
  });
}

describe("notes", () => {
  test("a visitor adds a note and sees it in their list", async () => {
    const app = fresh();
    const created = await post(app, ana, { text: "Buy milk" });
    expect(created.status).toBe(201);
    const note = await created.json();
    expect(note).toMatchObject({ text: "Buy milk" });

    const list = await app.request("/api/notes", { headers: ana });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([note]);
  });

  test("a visitor never sees another visitor's notes", async () => {
    const app = fresh();
    await post(app, ana, { text: "Ana's" });
    const list = await app.request("/api/notes", { headers: ben });
    expect(await list.json()).toEqual([]);
  });

  test("a visitor deletes their own note", async () => {
    const app = fresh();
    const { id } = await (await post(app, ana, { text: "Gone soon" })).json();
    const res = await del(app, ana, id);
    expect(res.status).toBe(204);
    const list = await app.request("/api/notes", { headers: ana });
    expect(await list.json()).toEqual([]);
  });

  test("a visitor cannot delete another visitor's note", async () => {
    const app = fresh();
    const { id } = await (await post(app, ana, { text: "Mine" })).json();
    const res = await del(app, ben, id);
    expect(res.status).toBe(404);
    const list = await app.request("/api/notes", { headers: ana });
    expect(await list.json()).toHaveLength(1);
  });

  test("an empty note is refused with a readable error", async () => {
    const app = fresh();
    const res = await post(app, ana, { text: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid", message: expect.any(String) });
  });

  test("an oversized body is refused with a readable 413 before it is read", async () => {
    const body = JSON.stringify({ text: "x".repeat(1024 * 1024) });
    const res = await fresh().request("/api/notes", {
      method: "POST",
      headers: { ...ana, "content-type": "application/json", "content-length": `${body.length}` },
      body,
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "too_large", message: expect.any(String) });
  });

  test("an oversized body sent in chunks, with no length, is refused too", async () => {
    // No content-length, as with chunked transfer: the limit counts the bytes as they arrive.
    const res = await post(fresh(), ana, { text: "x".repeat(1024 * 1024) });
    expect(res.status).toBe(413);
  });

  test("the longest note the route takes still fits under the body limit", async () => {
    const res = await post(fresh(), ana, { text: "😀".repeat(1000) });
    expect(res.status).toBe(201);
  });

  test("a visitor Basemodo did not sign in (a Public App) is refused", async () => {
    const app = fresh();
    const res = await app.request("/api/notes");
    expect(res.status).toBe(401);
  });

  test("a cross-site state-changing request is refused (CSRF)", async () => {
    const app = fresh();
    const { id } = await (await post(app, ana, { text: "Protected" })).json();
    // A request forged from another site: the browser reports "cross-site", which
    // the CSRF guard turns away before the route runs. The note survives.
    const res = await app.request(`/api/notes/${id}`, {
      method: "DELETE",
      headers: { ...ana, "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    const list = await app.request("/api/notes", { headers: ana });
    expect(await list.json()).toHaveLength(1);
  });
});

describe("without a Basemodo gate in front (local development)", () => {
  test("the stand-in is the visitor", async () => {
    const standIn = { id: "dev:me@example.com", email: "me@example.com" };
    const app = createApp({
      client: "./dist/client",
      db: migrate(openDatabase(":memory:")),
      standIn,
    });
    const created = await post(app, {}, { text: "Local" });
    expect(created.status).toBe(201);
    const list = await app.request("/api/notes");
    expect(await list.json()).toMatchObject([{ text: "Local", personId: standIn.id }]);
  });
});
