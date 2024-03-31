import { renderer } from "@/util";
import { PageLayout } from ".";

describe("PageLayout", () => {
  it("renders layout", async () => {
    const { text } = await renderer(<PageLayout>page</PageLayout>);
    expect(text).toMatchSnapshot();
  });
});
