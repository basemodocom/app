import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { createApp } from "./app";
import { migrate, openDatabase } from "./db";
import { type Identity, identify, requireRole, signedIn } from "./identity";

// An Ed25519 key pair, the kind Basemodo signs a visitor's JWT with. The public
// half is what an App gets as BASEMODO_JWT_PUBLIC_KEY; the private half stands in
// for the control plane, so these tests can mint tokens.
function derToPem(der: ArrayBuffer, label: string) {
  const base64 = Buffer.from(new Uint8Array(der)).toString("base64");
  const wrapped = (base64.match(/.{1,64}/g) ?? [base64]).join("\n");
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

async function keys() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    publicPem: derToPem(await crypto.subtle.exportKey("spki", pair.publicKey), "PUBLIC KEY"),
    privatePem: derToPem(await crypto.subtle.exportKey("pkcs8", pair.privateKey), "PRIVATE KEY"),
  };
}

const ANA = "11111111-1111-1111-1111-111111111111";
function claims(extra?: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://basemodo.com",
    aud: "https://app.example",
    sub: ANA,
    email: "ana@example.com",
    role: "owner",
    app: "22222222-2222-2222-2222-222222222222",
    iat: now,
    exp: now + 300,
    ...extra,
  };
}

function appVerifying(publicPem: string) {
  return createApp({
    client: "./dist/client",
    db: migrate(openDatabase(":memory:")),
    jwtPublicKey: publicPem,
  });
}

describe("identity verified by JWT", () => {
  test("a validly-signed token is the visitor, scoped to its sub", async () => {
    const { publicPem, privatePem } = await keys();
    const app = appVerifying(publicPem);
    const token = await sign(claims(), privatePem, "EdDSA");
    const auth = { "x-basemodo-jwt": token };

    const list = await app.request("/api/notes", { headers: auth });
    expect(list.status).toBe(200);

    const created = await app.request("/api/notes", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ text: "mine" }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ personId: ANA });
  });

  test("a plain X-Basemodo-Id header alone is refused (no signed token)", async () => {
    const { publicPem } = await keys();
    const app = appVerifying(publicPem);
    const res = await app.request("/api/notes", {
      headers: { "x-basemodo-id": "p_victim", "x-basemodo-email": "victim@example.com" },
    });
    expect(res.status).toBe(401);
  });

  test("a token signed by another key is refused", async () => {
    const { publicPem } = await keys();
    const other = await keys();
    const app = appVerifying(publicPem);
    const token = await sign(claims(), other.privatePem, "EdDSA");
    const res = await app.request("/api/notes", { headers: { "x-basemodo-jwt": token } });
    expect(res.status).toBe(401);
  });

  test("an expired token is refused", async () => {
    const { publicPem, privatePem } = await keys();
    const app = appVerifying(publicPem);
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(claims({ iat: now - 600, exp: now - 300 }), privatePem, "EdDSA");
    const res = await app.request("/api/notes", { headers: { "x-basemodo-jwt": token } });
    expect(res.status).toBe(401);
  });

  test("with no public key set, the gate's headers are trusted as before", async () => {
    const app = createApp({ client: "./dist/client", db: migrate(openDatabase(":memory:")) });
    const res = await app.request("/api/notes", {
      headers: { "x-basemodo-id": ANA, "x-basemodo-email": "ana@example.com" },
    });
    expect(res.status).toBe(200);
  });
});

// A tiny app with one route only owners and editors may reach.
const guarded = () =>
  new Hono<Identity>()
    .use(identify())
    .use(signedIn)
    .get("/", requireRole("owner", "editor"), (c) => c.text("ok"));
const as = (role?: string) => ({
  headers: {
    "x-basemodo-id": "p_ana",
    "x-basemodo-email": "ana@example.com",
    ...(role ? { "x-basemodo-role": role } : {}),
  },
});

describe("requireRole", () => {
  test("lets through a person whose role it names", async () => {
    expect((await guarded().request("/", as("owner"))).status).toBe(200);
    expect((await guarded().request("/", as("editor"))).status).toBe(200);
  });

  test("refuses a person whose role it does not name", async () => {
    const res = await guarded().request("/", as("member"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  test("refuses a person with no role (let in by link, Workspace or Public)", async () => {
    expect((await guarded().request("/", as())).status).toBe(403);
  });

  test("refuses a role Basemodo does not define", async () => {
    expect((await guarded().request("/", as("admin"))).status).toBe(403);
  });
});
