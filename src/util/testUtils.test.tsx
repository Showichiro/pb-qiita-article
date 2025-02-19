import type { FC } from "hono/jsx";
import { renderer } from "./testUtils";

describe("renderer", () => {
  it("should render component", async () => {
    const Component: FC = () => <div>test</div>;
    const results = await renderer(<Component />);
    expect(results.text).toEqual("<div>test</div>");
  });
});
