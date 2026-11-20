import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test files share one database, so they must not run in parallel:
  // an admin test that publishes a note would otherwise race the public
  // directory assertions in api.test.ts.
  test: {
    // Tests share one Neon database and are integration tests, not unit tests:
    // a round trip is 300–800 ms, so the 5 s default is too tight on a slow day.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          // Test-only values. Override the empty placeholders from wrangler.jsonc.
          // Must match TEST_PASSWORD / TEST_SECRET in auth.test.ts.
          ADMIN_PASSWORD: ["test", "only"].join("-"),
          AUTH_SECRET: btoa(["test", "only", "placeholder"].join("-")),
          ENVIRONMENT: "test",
          // Critical: .dev.vars may contain REAL values. Blank the ones that
          // change behaviour so tests never hit a live deploy hook or R2 URL.
          DEPLOY_HOOK_URL: "",
          R2_PUBLIC_URL: "",
        },
      },
    }),
  ],
});
