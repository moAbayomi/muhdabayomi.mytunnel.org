// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://moyomi.xyz",
  output: "static",
  prefetch: true,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
