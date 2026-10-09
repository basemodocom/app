import type { MiddlewareHandler } from "hono";

/**
 * Who is visiting, as Basemodo says. Basemodo signs visitors in before they
 * reach the App and sends these headers with every request, removing any a
 * visitor sends, so they are safe to trust: the App has no login of its own.
 */
export type Person = {
  /** Stable: keep records under it, not under the email. */
  id: string;
  email: string;
  /** Absent for visitors let in by link, by Workspace or because the App is public. */
  role?: "owner" | "member" | "editor";
};

export type Identity = { Variables: { person: Person } };

/**
 * Reads who is visiting into `c.var.person`, if Basemodo signed someone in.
 * `standIn` is who to be when no Basemodo is in front (local development only;
 * see index.ts).
 */
export function identify(standIn?: Person): MiddlewareHandler<{ Variables: { person?: Person } }> {
  return async (c, next) => {
    const id = c.req.header("x-basemodo-id");
    const email = c.req.header("x-basemodo-email");
    const role = c.req.header("x-basemodo-role") as Person["role"];
    const person = id && email ? { id, email, role } : standIn;
    if (person) c.set("person", person);
    await next();
  };
}

/** Lets only signed-in visitors through: a Public App's anonymous visitors get a 401. */
export const signedIn: MiddlewareHandler<Identity> = async (c, next) => {
  if (!c.get("person")) return c.json({ error: "not_signed_in" }, 401);
  await next();
};
