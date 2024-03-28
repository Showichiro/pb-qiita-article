import { Hono } from "@/lib";
import { testClient } from "hono/testing";
import { HtmlEscapedString } from "hono/utils/html";

/**
 * @description
 * Render a component to a string.
 * @param component
 * @returns string
 */
export const renderer = async (
  component: HtmlEscapedString | Promise<HtmlEscapedString>
): Promise<{ status: number; text: string }> => {
  const app = new Hono().get("/test", (c) => c.html(component));
  const res = await testClient(app).test.$get();
  return { status: res.status, text: await res.text() };
};
