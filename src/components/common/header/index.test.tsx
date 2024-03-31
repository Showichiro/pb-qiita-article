import { renderer } from "@/util";
import { Header } from ".";

describe("Header", () => {
  it("renders Header", async () => {
    const { text } = await renderer(<Header />);
    expect(text).toMatchSnapshot();
  });

  it("renders Header with Custom Menu", async () => {
    const { text } = await renderer(
      <Header>
        <>menu</>
      </Header>
    );
    expect(text).toMatchSnapshot();
  });
});
