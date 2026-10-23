import type { Context, Env, MiddlewareHandler } from "hono";

type Options<E extends Env> = {
  /** The most requests one key may make within a window. */
  limit: number;
  /** The window's length, in milliseconds. */
  windowMs: number;
  /** What to count requests by: `person.id` once a Person is known, `byAddress` before. */
  key: (c: Context<E>) => string;
  /** The clock; injected in tests, `Date.now` otherwise. */
  now?: () => number;
};

/**
 * Refuses a key more than `limit` requests per `windowMs` with a 429 and a
 * `Retry-After`. The count lives in this Process's memory: on Basemodo the App
 * is a single Process, so the count is exact while it runs and resets when the
 * App sleeps (after it has been idle, which is when no limit is needed) or
 * redeploys. For a limit that must outlast that (form entries a day), count in
 * the Database instead.
 */
export function rateLimit<E extends Env>({
  limit,
  windowMs,
  key,
  now = Date.now,
}: Options<E>): MiddlewareHandler<E> {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const at = now();
    const k = key(c);
    let window = windows.get(k);
    if (!window || window.resetAt <= at) {
      window = { count: 0, resetAt: at + windowMs };
      windows.set(k, window);
    }
    window.count++;
    if (window.count > limit) {
      c.header("Retry-After", String(Math.ceil((window.resetAt - at) / 1000)));
      return c.json({ error: "rate_limited" }, 429);
    }
    // Keep the map bounded: once it has grown, forget windows that have elapsed.
    if (windows.size > 10_000) {
      for (const [mapKey, mapWindow] of windows) {
        if (mapWindow.resetAt <= at) windows.delete(mapKey);
      }
    }
    await next();
  };
}

/**
 * A `key` for a limit before a Person is known (a Public App's waitlist or contact
 * form): the address the request came from, which Basemodo puts in
 * `X-Forwarded-For` after removing any a visitor sent, so no visitor picks their
 * own count. An IPv6 visitor counts by their /64, which one visitor commonly holds
 * whole, as Basemodo counts a client. A Caller (another of the Owner's Apps calling
 * this one) comes with the calling App's internal address, so all its calls count
 * together; tell Callers apart by `X-Basemodo-Caller`, since that address may
 * change with each Deploy. Locally, with no Basemodo in front, there is no address
 * and every request shares one count.
 *
 *   .use(rateLimit({ limit: 10, windowMs: 60_000, key: byAddress }))
 *
 * Once a Person is known, key on `person.id` instead, as the notes router does:
 * people behind one address (an office, a phone carrier) then don't share a
 * count, and one person doesn't get a fresh one on each network.
 */
export function byAddress(c: Context): string {
  const address = c.req.header("x-forwarded-for") ?? "";
  if (!address.includes(":")) return address;
  // IPv6: its first four groups of eight, `::` standing for the zero groups left out.
  const [head = "", tail = ""] = address.split("::");
  const groups = (part: string) => (part ? part.split(":") : []);
  const zeros = Math.max(0, 8 - groups(head).length - groups(tail).length);
  const all = [...groups(head), ...Array.from({ length: zeros }, () => "0"), ...groups(tail)];
  return `${all.slice(0, 4).join(":")}::/64`;
}
