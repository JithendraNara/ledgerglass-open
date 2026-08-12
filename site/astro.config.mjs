import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ledgerglass-open.jnara01.workers.dev",
  output: "static",
  build: { format: "directory" },
  vite: { build: { cssMinify: true } },
});
