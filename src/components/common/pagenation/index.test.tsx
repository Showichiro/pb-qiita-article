import { renderer } from "@/util";
import { Pagenation } from "@/components";

describe("Pagenation", () => {
  it("should render pagenation with disabled next page button", async () => {
    const { text } = await renderer(<Pagenation limit={10} page={1} />);
    expect(text).toMatchSnapshot();
  });

  it("should render pagenation with active next page button", async () => {
    const { text } = await renderer(<Pagenation limit={10} page={2} />);
    expect(text).toMatchSnapshot();
  });
});
