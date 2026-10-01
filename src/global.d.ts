/** biome-ignore-all lint/correctness/noUnusedImports: auto-generated */
import {} from "hono";

declare module "hono" {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: Hono requires interface augmentation.
    (content: string | Promise<string>, props?: { title?: string }): Response;
  }
}
