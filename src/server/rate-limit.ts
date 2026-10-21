import type { Context, Env, MiddlewareHandler } from "hono";

type Options<E extends Env> = {
  /** The most requests one key may make within a window. */
  limit: number;
  /** The window's length, in milliseconds. */
  windowMs: number;
  /** What to count requests by — usually the visitor's id. */
  key: (c: Context<E>) => string;
  /** The clock; injected in tests, `Date.now` otherwise. */
  now?: () => number;
};

/**
 * Refuses a key more than `limit` requests per `windowMs` with a 429 and a
 * `Retry-After`. The count lives in this Process's memory: on Basemodo the App
 * is a single Process, so the count is exact while it runs and resets when the
 * App sleeps (after it has been idle, which is when no limit is needed) or
 * redeploys. To limit across sleeps, or by raw IP before a visitor is known,
 * limit at Basemodo's edge instead.
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
