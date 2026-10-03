import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import ssrPlugin from "vite-ssr-components/plugin";
export default defineConfig({
  plugins: [
    cloudflare({ remoteBindings: false }),
    ssrPlugin({
      entry: { target: "src/renderer.tsx" },
      hotReload: { morph: false },
    }),
  ],
  resolve: { alias: { "@": "/src" } },
});
