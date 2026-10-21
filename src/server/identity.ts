import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";

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

/** Keeps only a role Basemodo defines; any other value is no role. */
function knownRole(raw: string | undefined): Person["role"] {
  return raw === "owner" || raw === "member" || raw === "editor" ? raw : undefined;
}

/**
 * Reads who is visiting into `c.var.person`, if Basemodo signed someone in.
 *
 * By default the App trusts the plain `X-Basemodo-*` headers, which the gate
 * injects and strips from anything a visitor sends. Pass `jwtPublicKey` (the
 * App's `BASEMODO_JWT_PUBLIC_KEY`, PEM) to make identity defense in depth: the
 * App then trusts only `X-Basemodo-Jwt`, a short-lived token the gate signs with
 * the App's own key (EdDSA), so a forged header alone is not enough even if a
 * request reaches the App without passing through the gate.
 *
 * `standIn` is who to be when no Basemodo is in front (local development only;
 * see index.ts).
 */
export function identify(
  standIn?: Person,
  jwtPublicKey?: string,
): MiddlewareHandler<{ Variables: { person?: Person } }> {
  return async (c, next) => {
    let person: Person | undefined;
    if (jwtPublicKey) {
      // Cryptographic identity: a validly-signed, unexpired token, or no one.
      const token = c.req.header("x-basemodo-jwt");
      if (token) {
        try {
          const claims = await verify(token, jwtPublicKey, "EdDSA");
          if (typeof claims.sub === "string" && typeof claims.email === "string") {
            const role = knownRole(typeof claims.role === "string" ? claims.role : undefined);
            person = { id: claims.sub, email: claims.email, role };
          }
        } catch {
          // A missing, forged or expired token leaves no person; `signedIn` 401s.
        }
      }
    } else {
      const id = c.req.header("x-basemodo-id");
      const email = c.req.header("x-basemodo-email");
      if (id && email) person = { id, email, role: knownRole(c.req.header("x-basemodo-role")) };
    }
    person ??= standIn;
    if (person) c.set("person", person);
    await next();
  };
}

/** Lets only signed-in visitors through: a Public App's anonymous visitors get a 401. */
export const signedIn: MiddlewareHandler<Identity> = async (c, next) => {
  if (!c.get("person")) return c.json({ error: "not_signed_in" }, 401);
  await next();
};
