export const PRODUCTION_D1_ID = "06e39e3a-7b73-4aaf-a334-ab3f95804ba5";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function selectDatabaseId(isPreview, previewDatabaseId) {
  if (!isPreview) return PRODUCTION_D1_ID;

  if (!previewDatabaseId || !UUID_PATTERN.test(previewDatabaseId)) {
    throw new Error(
      "A valid CLOUDFLARE_PREVIEW_D1_DATABASE_ID is required for Worker Previews.",
    );
  }

  if (previewDatabaseId.toLowerCase() === PRODUCTION_D1_ID) {
    throw new Error(
      "Worker Preview D1 must not use the production database.",
    );
  }

  return previewDatabaseId.toLowerCase();
}
