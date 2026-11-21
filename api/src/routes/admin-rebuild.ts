import { Hono } from "hono";
import type { AppEnv } from "../env";
import { AppError } from "../errors";

const adminRebuild = new Hono<AppEnv>();

/**
 * Turn a database write into a live page.
 *
 * Two ways to start the build, in order of preference:
 *
 *   1. DEPLOY_HOOK_URL — a Cloudflare Pages deploy hook. Only works if the
 *      Pages project is connected to Git, because a hook triggers a *build*.
 *   2. GITHUB_TOKEN + GITHUB_REPO — dispatch .github/workflows/deploy.yml.
 *      Works with Direct Upload projects, which are what `wrangler pages
 *      deploy` creates, and keeps CI as the single deploy path.
 *
 * If neither is configured, return 503 with a message the editor can show.
 */
adminRebuild.post("/", async (c) => {
  const hook = c.env.DEPLOY_HOOK_URL;

  if (hook) {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) {
      throw new AppError(502, "rebuild_failed", `Deploy hook returned ${res.status}`);
    }
    return c.json({ triggered: true, via: "hook" }, 202);
  }

  const token = c.env.GITHUB_TOKEN;
  const repo = c.env.GITHUB_REPO;

  if (!token || !repo) {
    throw new AppError(
      503,
      "rebuild_not_configured",
      "Set DEPLOY_HOOK_URL, or GITHUB_TOKEN and GITHUB_REPO, to enable rebuilds",
    );
  }

  const ref = c.env.GITHUB_REF ?? "main";
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "moyomi-wiki",
      },
      body: JSON.stringify({ ref }),
    },
  );

  if (!res.ok) {
    throw new AppError(
      502,
      "rebuild_failed",
      `GitHub dispatch returned ${res.status}`,
    );
  }

  return c.json({ triggered: true, via: "github" }, 202);
});

export default adminRebuild;
