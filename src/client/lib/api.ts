import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "../../server/app";

/**
 * The API, typed from the server's routes: `api.notes.$get()` and friends. A
 * route whose path or shape changes on the server fails the type check here.
 */
export const api = hc<AppType>("/api");

export type Note = InferResponseType<typeof api.notes.$get, 200>[number];

/**
 * Throws the server's message for an answer that is not ok, so queries fail
 * visibly, and narrows the answer to the route's successful ones: `.json()` is
 * then the list or the record, not a union with the 400 of `invalid`. Only an
 * answer with an explicit status (`c.json(rows, 200)`) counts as successful; one
 * without (`c.json(rows)`) leaves nothing, and `.json()` fails the type check.
 */
export async function ok<T extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  res: Promise<T>,
): Promise<Extract<T, { ok: true }>> {
  const answer = await res;
  if (!answer.ok) {
    const body = (await answer.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `The server answered ${answer.status}`);
  }
  return answer as Extract<T, { ok: true }>;
}
