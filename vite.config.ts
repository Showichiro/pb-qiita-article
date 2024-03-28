import build from "@hono/vite-cloudflare-pages";
import devServer from "@hono/vite-dev-server";
import adapter from "@hono/vite-dev-server/cloudflare";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    build(),
    devServer({
      adapter,
      entry: "src/index.tsx",
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    globals: true,
  },
});
