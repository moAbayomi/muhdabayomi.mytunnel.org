import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test files share one database, so they must not run in parallel:
  // an admin test that publishes a note would otherwise race the public
  // directory assertions in api.test.ts.
  test: {
    fileParallelism: false,
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
        },
      },
    }),
  ],
});
