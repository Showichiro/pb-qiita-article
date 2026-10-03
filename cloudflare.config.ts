import { bindings, defineConfig, triggers } from "cf/config";
import { selectDatabaseId } from "./scripts/preview-config.mjs";

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "pb-qiita-articles",
    entrypoint: "./src/worker.ts",
    compatibilityDate: "2026-10-01",
    env: {
      DB: bindings.d1({
        id: selectDatabaseId(
          isPreview,
          process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID,
        ),
      }),
    },
    ...(isPreview || process.env.CF_PREVIEW === "1"
      ? {}
      : { triggers: [triggers.scheduled({ schedule: "0 15 * * *" })] }),
  },
}));
