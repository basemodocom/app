import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { openDatabase } from "./db";

// Each test gets its own App on a fresh in-memory Database, migrated as at start.
function fresh() {
  return createApp({ client: "./dist/client", db: openDatabase(":memory:") });
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
    const res = await app.request(`/api/notes/${id}`, { method: "DELETE", headers: ana });
    expect(res.status).toBe(204);
    const list = await app.request("/api/notes", { headers: ana });
    expect(await list.json()).toEqual([]);
  });

  test("a visitor cannot delete another visitor's note", async () => {
    const app = fresh();
    const { id } = await (await post(app, ana, { text: "Mine" })).json();
    const res = await app.request(`/api/notes/${id}`, { method: "DELETE", headers: ben });
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

  test("a visitor Basemodo did not sign in (a Public App) is refused", async () => {
    const app = fresh();
    const res = await app.request("/api/notes");
    expect(res.status).toBe(401);
  });
});

describe("without a Basemodo gate in front (local development)", () => {
  test("the stand-in is the visitor", async () => {
    const standIn = { id: "dev:me@example.com", email: "me@example.com" };
    const app = createApp({ client: "./dist/client", db: openDatabase(":memory:"), standIn });
    const created = await post(app, {}, { text: "Local" });
    expect(created.status).toBe(201);
    const list = await app.request("/api/notes");
    expect(await list.json()).toMatchObject([{ text: "Local", personId: standIn.id }]);
  });
});
