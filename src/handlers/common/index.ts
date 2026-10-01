import type { Context } from "hono";
import { z } from "zod";
import type { $ZodError } from "zod/v4/core";

export const BadRequestHandler = <T>(
  result: { success: true; data: T } | { success: false; error: $ZodError },
  c: Context,
) => {
  if (!result.success) {
    return c.json(
      {
        title: "Bad Request",
        detail: z.formatError(result.error),
        status: 400,
      },
      400,
    );
  }
};
