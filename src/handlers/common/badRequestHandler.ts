import type { Context } from "hono";
import type { ZodError } from "zod";

export const BadRequestHandler = <T>(
  result: { success: true; data: T } | { success: false; error: ZodError },
  c: Context,
) => {
  if (!result.success) {
    return c.json({
      title: "Bad Request",
      detail: result.error.format(),
      status: 400,
    }, 400);
  }
};
