import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          // Test-only values. Override the empty placeholders from wrangler.jsonc.
          // Must match TEST_PASSWORD / TEST_SECRET in auth.test.ts.
          ADMIN_PASSWORD: "test-password",
          AUTH_SECRET: "dGVzdC1zZWNyZXQtMzItYnl0ZXMtbG9uZy1wbGFjZWhvbGRlcg==",
          ENVIRONMENT: "test",
        },
      },
    }),
  ],
});
