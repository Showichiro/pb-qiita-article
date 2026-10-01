import { bindings, defineConfig } from "cf/config";
export default defineConfig({
  worker: {
    name: "pb-qiita-articles",
    entrypoint: "./src/index.tsx",
    compatibilityDate: "2026-10-01",
    env: { DB: bindings.d1({ id: "06e39e3a-7b73-4aaf-a334-ab3f95804ba5" }) },
  },
});
