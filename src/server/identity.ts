import type { Context, MiddlewareHandler } from "hono";

/**
 * Who is visiting, as Basemodo says. Basemodo signs visitors in before they
 * reach the App and sends these headers with every request, removing any a
 * visitor tries to send, so they are safe to trust. Never build a login.
 */
export type Person = {
  /** Stable: keep records under it, not under the email. */
  id: string;
  email: string;
  /** "owner", "member" or "editor"; absent for Link, Public and Workspace visitors. */
  role?: string;
};

export type Identity = { Variables: { person: Person } };

/** The visitor, or null when Basemodo signed nobody in (a Public App). */
export function visitor(c: Context, standIn?: Person): Person | null {
  const id = c.req.header("x-basemodo-id");
  const email = c.req.header("x-basemodo-email");
  if (id && email) return { id, email, role: c.req.header("x-basemodo-role") };
  return standIn ?? null;
}

/**
 * Lets only signed-in visitors through, as `c.var.person`. `standIn` is who to
 * be when there is no gate in front (local development only; see index.ts).
 */
export function signedIn(standIn?: Person): MiddlewareHandler<Identity> {
  return async (c, next) => {
    const person = visitor(c, standIn);
    if (!person) return c.json({ error: "not_signed_in" }, 401);
    c.set("person", person);
    await next();
  };
}
