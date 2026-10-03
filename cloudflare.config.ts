import { bindings, defineConfig, triggers } from "cf/config";
export default defineConfig({
  worker: {
    name: "pb-qiita-articles",
    entrypoint: "./src/worker.ts",
    compatibilityDate: "2026-10-01",
    env: { DB: bindings.d1({ id: "06e39e3a-7b73-4aaf-a334-ab3f95804ba5" }) },
    triggers: [triggers.scheduled({ schedule: "0 15 * * *" })],
  },
});
