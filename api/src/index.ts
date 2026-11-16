import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { timing } from "hono/timing";
import { structuredLogger } from "@hono/structured-logger";
import { cors } from "hono/cors";
import type { RequestIdVariables } from "hono/request-id";
import type { TimingVariables } from "hono/timing";
import type { AppEnv } from "./env";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "./errors";
import health from "./routes/health";
import directory from "./routes/directory";
import notes from "./routes/notes";
import wikiStats from "./routes/wiki-stats";
import search from "./routes/search";
import { HTTPException } from "hono/http-exception";
import auth from "./routes/auth";
import adminNotes from "./routes/admin-notes";
import adminMedia from "./routes/admin-media";
import adminRebuild from "./routes/admin-rebuild";
import media from "./routes/media";
import { requireAuth } from "./middleware/requireAuth";

export interface Env {
  WEB_ORIGIN: string;
}

const app = new Hono<{
  Bindings: AppEnv["Bindings"];
  Variables: RequestIdVariables & TimingVariables;
}>();

app.use(
  "/v1/*",
  cors({
    origin: (origin, c) => {
      // WEB_ORIGIN can be a single URL, or a comma-separated list
      const allowed = (c.env.WEB_ORIGIN ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // 24h — preflight cache
  }),
);
app.use("*", requestId());
app.use("*", timing());
app.use(
  "*",
  structuredLogger({
    createLogger: (c) => console,
    onResponse: (logger, c, elapsedMs) =>
      logger.info(
        {
          method: c.req.method,
          path: c.req.path,
          elapsedMs,
        },
        "request completed",
      ),
  }),
);

// Test-only route for exercising requireAuth in isolation.
// Gated per-request, not at module scope: reading `env` at import time
// behaves differently between wrangler dev and the vitest runtime, which
// made this route 404 locally even with ENVIRONMENT=test.
app.post(
  "/_test/protected",
  async (c, next) => {
    if (c.env.ENVIRONMENT !== "test") return c.notFound();
    await next();
  },
  requireAuth(),
  (c) => c.json({ ok: true }),
);

app.route("/v1/auth", auth);

// Public read-through to R2. Unused in production once R2_PUBLIC_URL points at
// a custom domain, but it is what makes uploads viewable in local dev and tests.
app.route("/v1/media", media);

// One middleware for the whole subtree: every admin route added later is
// protected by default rather than by remembering to add requireAuth().
app.use("/v1/admin/*", requireAuth());
app.route("/v1/admin/notes", adminNotes);
app.route("/v1/admin/media", adminMedia);
app.route("/v1/admin/rebuild", adminRebuild);

app.route("/v1/health", health);
app.route("/v1/directory", directory);
app.route("/v1/notes", notes);
app.route("/v1/stats", wikiStats);
app.route("/v1/search", search);


app.onError((err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: err.status === 400 ? "invalid_input" : "http_error",
          message: err.message || "Request failed",
          requestId: c.get("requestId"),
        },
      },
      err.status,
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId,
        },
      },
      err.status as ContentfulStatusCode,
    );
  }

  console.error({ requestId, err });
  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong",
        requestId,
      },
    },
    500,
  );
});

export default app;
