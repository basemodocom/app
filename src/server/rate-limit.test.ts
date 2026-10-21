import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit";

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
