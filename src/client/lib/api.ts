import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "../../server/app";

/**
 * The API, typed from the server's routes: `api.notes.$get()` and friends. A
 * route whose path or shape changes on the server fails the type check here.
 */
export const api = hc<AppType>("/api");

export type Note = InferResponseType<typeof api.notes.$get, 200>[number];

/** Throws the server's message for an answer that is not ok, so queries fail visibly. */
export async function ok<T extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  res: Promise<T>,
) {
  const answer = await res;
  if (!answer.ok) {
    const body = (await answer.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `The server answered ${answer.status}`);
  }
  return answer;
}
