import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ledgerglass-showcase.jnara01.workers.dev",
  output: "static",
  build: { format: "directory" },
  vite: { build: { cssMinify: true } },
});
