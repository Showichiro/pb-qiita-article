import { renderer } from "@/util";
import { PageTitle } from ".";

describe("PageTitle", () => {
  it("renders page title", async () => {
    const { text } = await renderer(<PageTitle label="test" />);
    expect(text).toMatchSnapshot();
  });
});
