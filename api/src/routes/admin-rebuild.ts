import { Hono } from "hono";
import type { AppEnv } from "../env";
import { AppError } from "../errors";

const adminRebuild = new Hono<AppEnv>();

/**
 * Trigger a static rebuild after a publish. The Pages deploy hook is the only
 * thing that turns a database write into a live page, so a failure here is
 * worth surfacing rather than swallowing.
 */
adminRebuild.post("/", async (c) => {
  const url = c.env.DEPLOY_HOOK_URL;

  if (!url) {
    throw new AppError(
      503,
      "rebuild_not_configured",
      "DEPLOY_HOOK_URL is not set for this environment",
    );
  }

  const res = await fetch(url, { method: "POST" });

  if (!res.ok) {
    throw new AppError(502, "rebuild_failed", `Deploy hook returned ${res.status}`);
  }

  return c.json({ triggered: true }, 202);
});

export default adminRebuild;
