/**
 * Bindings the Worker expects.
 *
 * Secrets (DATABASE_URL, ADMIN_PASSWORD, AUTH_SECRET, DEPLOY_HOOK_URL,
 * R2_PUBLIC_URL) are set with `wrangler secret put` and never declared in
 * wrangler.jsonc — an empty `vars` entry would ship as an empty string if the
 * secret were missing, which silently breaks auth instead of failing loudly.
 *
 * Locally they come from api/.dev.vars.
 */
export type Env = {
  DATABASE_URL: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;
  WEB_ORIGIN: string;
  ENVIRONMENT?: string;
  DEPLOY_HOOK_URL?: string;
  R2_PUBLIC_URL?: string;
  MEDIA_BUCKET: R2Bucket;
  /**
   * Alternative to DEPLOY_HOOK_URL: dispatch the GitHub Actions deploy
   * workflow. Works with Direct Upload Pages projects, where deploy hooks do
   * not have a build to trigger.
   */
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_REF?: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
  };
};
