import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export const BadRequestHandler = <T>(
  result: { success: true; data: T } | { success: false; error: ZodError }
) => {
  if (result.success) {
    return;
  }
  throw new HTTPException(400, {
    message: JSON.stringify({
      title: "Bad Request",
      detail: result.error.format(),
      status: 400,
    }),
  });
};
