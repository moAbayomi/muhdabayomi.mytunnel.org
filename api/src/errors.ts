// errors.ts
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  status: ContentfulStatusCode;
  code: string;
  details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
