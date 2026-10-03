import config from "../cloudflare.config.ts";
import {
  PRODUCTION_D1_ID,
  selectDatabaseId,
} from "./preview-config.mjs";

const expectedId = selectDatabaseId(
  true,
  process.env.EXPECTED_PREVIEW_D1_DATABASE_ID,
);
if (process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID !== expectedId) {
  throw new Error(
    "Configured preview D1 does not match the database provisioned for this job.",
  );
}
if (typeof config !== "function") {
  throw new Error("Expected a function-form Cloudflare project configuration.");
}

const previewConfig = await config({ isPreview: true, mode: "production" });
const actualId = previewConfig.worker?.env?.DB?.id;
if (actualId !== expectedId || actualId === PRODUCTION_D1_ID) {
  throw new Error(
    "Cloudflare Preview configuration did not bind the validated nonproduction D1.",
  );
}

const productionConfig = await config({
  isPreview: false,
  mode: "production",
});
if (productionConfig.worker?.env?.DB?.id !== PRODUCTION_D1_ID) {
  throw new Error("Production D1 configuration changed unexpectedly.");
}
if (productionConfig.worker?.entrypoint !== "./src/worker.ts") {
  throw new Error("Production worker entrypoint changed unexpectedly.");
}
if (!productionConfig.worker?.triggers || productionConfig.worker.triggers.length === 0) {
  throw new Error("Production Cron triggers are missing.");
}
if (productionConfig.worker.triggers[0]?.schedule !== "0 15 * * *") {
  throw new Error("Production Cron schedule changed unexpectedly.");
}

if (previewConfig.worker?.triggers && previewConfig.worker.triggers.length > 0) {
  throw new Error("Preview configuration must not have scheduled triggers.");
}

process.stdout.write(`Validated preview D1 binding ${actualId}.\n`);
