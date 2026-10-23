import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { byAddress, rateLimit } from "./rate-limit";

// A tiny app whose clock the test controls, keyed by an `x-who` header.
function appWith(clock: () => number) {
  return new Hono()
    .use(
      rateLimit({
        limit: 2,
        windowMs: 1000,
        key: (c) => c.req.header("x-who") ?? "anon",
        now: clock,
      }),
    )
    .get("/", (c) => c.text("ok"));
}
const who = (name: string) => ({ headers: { "x-who": name } });

describe("rateLimit", () => {
  test("allows up to the limit, then 429s with Retry-After", async () => {
    const app = appWith(() => 0);
    expect((await app.request("/", who("ana"))).status).toBe(200);
    expect((await app.request("/", who("ana"))).status).toBe(200);
    const blocked = await app.request("/", who("ana"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("1");
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
  });

  test("counts each key on its own", async () => {
    const app = appWith(() => 0);
    await app.request("/", who("ana"));
    await app.request("/", who("ana"));
    // ben is untouched by ana reaching her limit.
    expect((await app.request("/", who("ben"))).status).toBe(200);
  });

  test("the window resets once it has elapsed", async () => {
    let t = 0;
    const app = appWith(() => t);
    await app.request("/", who("ana"));
    await app.request("/", who("ana"));
    expect((await app.request("/", who("ana"))).status).toBe(429);
    t += 1000; // the window has passed
    expect((await app.request("/", who("ana"))).status).toBe(200);
  });
});

// The same app keyed by the address Basemodo's gate puts in X-Forwarded-For.
const byAddressApp = () =>
  new Hono()
    .use(rateLimit({ limit: 2, windowMs: 1000, key: byAddress, now: () => 0 }))
    .get("/", (c) => c.text("ok"));
const from = (address: string) => ({ headers: { "x-forwarded-for": address } });

describe("rateLimit keyed byAddress", () => {
  test("without an address (no Basemodo in front), every request shares one count", async () => {
    const app = byAddressApp();
    await app.request("/");
    await app.request("/");
    expect((await app.request("/")).status).toBe(429);
  });

  test("counts each address on its own", async () => {
    const app = byAddressApp();
    await app.request("/", from("203.0.113.7"));
    await app.request("/", from("203.0.113.7"));
    expect((await app.request("/", from("203.0.113.7"))).status).toBe(429);
    // Another address is untouched by the first reaching its limit.
    expect((await app.request("/", from("198.51.100.2"))).status).toBe(200);
  });

  // One IPv6 visitor commonly holds a whole /64 and can send from any of it.
  test("counts an IPv6 visitor by their /64, as Basemodo counts a client", async () => {
    const app = byAddressApp();
    await app.request("/", from("2001:db8:1:2::1"));
    await app.request("/", from("2001:db8:1:2:ffff::9"));
    expect((await app.request("/", from("2001:db8:1:2:a:b:c:d"))).status).toBe(429);
    // The next /64 over is someone else.
    expect((await app.request("/", from("2001:db8:1:3::1"))).status).toBe(200);
  });

  // The gate writes an address in its shortest form, where `::` may stand for
  // zero groups inside the /64: 2001:db8::1 is 2001:db8:0:0:0:0:0:1.
  test("finds the /64 wherever the address is shortened", async () => {
    const app = byAddressApp();
    await app.request("/", from("2001:db8::1"));
    await app.request("/", from("2001:db8:0:0:1::"));
    expect((await app.request("/", from("2001:db8::2"))).status).toBe(429);
    expect((await app.request("/", from("2001:db8:0:1::1"))).status).toBe(200);
  });
});
