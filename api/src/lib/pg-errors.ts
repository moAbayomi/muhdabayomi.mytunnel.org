import { AppError } from "../errors";

type PgError = {
  code?: string;
  message?: string;
  detail?: string;
};

/**
 * Translate the Postgres errors the admin routes can actually provoke into
 * AppErrors. Anything unrecognised is rethrown and becomes a 500.
 *
 * Codes:
 *   P0001 — RAISE EXCEPTION from our own PL/pgSQL (publish_note's empty-body
 *           guard, create_note's reserved-slug / bad-parent checks) → 422
 *   23505 — unique_violation (slug collision that escaped the retry loop) → 409
 *   23503 — foreign_key_violation (e.g. a parent_id pointing at nothing) → 422
 *   22P02 — invalid_text_representation (bad uuid reaching SQL) → 400
 */
export function mapPgError(err: unknown): never {
  const e = (err ?? {}) as PgError;

  if (e.code === "P0001") {
    throw new AppError(422, "invalid_note", e.message ?? "The note could not be saved");
  }

  if (e.code === "23505") {
    throw new AppError(409, "slug_conflict", "A note with that slug already exists", {
      detail: e.detail,
    });
  }

  if (e.code === "23503") {
    throw new AppError(422, "invalid_reference", "A referenced note does not exist");
  }

  if (e.code === "22P02") {
    throw new AppError(400, "invalid_id", "A parameter is not a valid id");
  }

  throw err;
}
