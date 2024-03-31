import { renderer } from "@/util";
import { ToTopButton } from ".";

describe("ToTopButton", () => {
  it("returns button", async () => {
    const { text } = await renderer(<ToTopButton />);
    expect(text).toMatchSnapshot();
  });
});
