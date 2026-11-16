import { AppError } from "../errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reject a non-uuid path segment as 404 rather than letting Postgres throw
 * 22P02 (invalid_text_representation), which would surface as a 500.
 *
 * `what` doubles as the error-code prefix: "media" → media_not_found.
 * (admin-notes.ts has its own equivalent helper from Phase 5; folding it into
 * this module is a tidy-up, not a behaviour change.)
 */
export function uuidOr404(raw: string, what: string): string {
  if (!UUID_RE.test(raw)) {
    throw new AppError(404, `${what}_not_found`, `No ${what} with id "${raw}"`);
  }
  return raw;
}
