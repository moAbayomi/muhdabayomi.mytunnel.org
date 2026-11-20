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
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
  };
};
