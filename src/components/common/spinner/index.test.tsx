import { renderer } from "@/util";
import { Spinner } from ".";

describe("Spinner", () => {
  it("renders spinner", async () => {
    const { text } = await renderer(<Spinner />);
    expect(text).toMatchSnapshot();
  });
});
