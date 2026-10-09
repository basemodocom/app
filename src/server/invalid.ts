import type { Context } from "hono";

type Result =
  | { success: true }
  | { success: false; error: { issues: ReadonlyArray<{ message: string }> } };

/** Answers input that failed validation with a 400 a person can read. */
export function invalid(result: Result, c: Context) {
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    return c.json({ error: "invalid", message }, 400);
  }
}
