// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Select,
  SelectGroup,
  SelectOption,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./index";

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

describe("cn utility", () => {
  it("merges strings, ignores falsy values, and processes conditional objects and arrays", () => {
    expect(cn("foo", undefined, null, false, "bar")).toBe("foo bar");
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
    expect(cn(["nested", ["deep", { item: true }]])).toBe("nested deep item");
  });
});

describe("Button component", () => {
  it("renders with default variant and size", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<Button>Click me</Button>);
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Click me");
    expect(button?.getAttribute("data-slot")).toBe("button");
    expect(button?.getAttribute("data-variant")).toBe("default");
    expect(button?.getAttribute("data-size")).toBe("default");
    expect(button?.className).toContain("bg-primary");
  });

  it("applies different variants and sizes", () => {
    expect(buttonVariants({ variant: "destructive", size: "sm" })).toContain(
      "bg-destructive",
    );
    expect(buttonVariants({ variant: "destructive", size: "sm" })).toContain(
      "h-8",
    );
    expect(buttonVariants({ variant: "outline", size: "lg" })).toContain(
      "border",
    );
    expect(buttonVariants({ variant: "outline", size: "lg" })).toContain(
      "h-10",
    );
  });

  it("handles click and disabled states", async () => {
    const handleClick = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>,
      );
    });

    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe("Input component", () => {
  it("renders input with accessible attributes and handles value changes", async () => {
    const handleChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Input
          placeholder="Enter text"
          defaultValue="test value"
          onChange={handleChange}
          aria-invalid={true}
        />,
      );
    });

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("data-slot")).toBe("input");
    expect(input?.placeholder).toBe("Enter text");
    expect(input?.value).toBe("test value");
    expect(input?.getAttribute("aria-invalid")).toBe("true");

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (input) {
        nativeInputValueSetter?.call(input, "updated value");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(handleChange).toHaveBeenCalled();
  });
});

describe("Select component", () => {
  it("renders native select with wrapper and custom icon", async () => {
    const handleChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Select
          name="orderField"
          defaultValue="createdAt"
          onChange={handleChange}
        >
          <SelectOption value="createdAt">投稿日</SelectOption>
          <SelectOption value="likesCount">いいね数</SelectOption>
          <SelectGroup label="その他">
            <SelectOption value="stocksCount">ストック数</SelectOption>
          </SelectGroup>
        </Select>,
      );
    });

    const wrapper = container.querySelector('[data-slot="select-wrapper"]');
    expect(wrapper).not.toBeNull();

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select?.getAttribute("data-slot")).toBe("select");
    expect(select?.value).toBe("createdAt");

    const icon = container.querySelector('[data-slot="select-icon"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => {
      if (select) {
        select.value = "likesCount";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(handleChange).toHaveBeenCalled();
  });
});

describe("Table component", () => {
  it("renders table with responsive container and semantic elements", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Table>
          <TableCaption>Article Results</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Post 1</TableCell>
              <TableCell>User A</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total: 1</TableCell>
            </TableRow>
          </TableFooter>
        </Table>,
      );
    });

    expect(
      container.querySelector('[data-slot="table-container"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="table-header"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="table-body"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="table-footer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="table-caption"]')?.textContent,
    ).toBe("Article Results");

    const th = container.querySelector("th");
    expect(th?.getAttribute("scope")).toBe("col");
  });
});

describe("Card component", () => {
  it("renders card primitives with proper hierarchy and data slots", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
            <CardAction>
              <Button size="sm">Action</Button>
            </CardAction>
          </CardHeader>
          <CardContent>Card Content</CardContent>
          <CardFooter>Card Footer</CardFooter>
        </Card>,
      );
    });

    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="card-header"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="card-title"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="card-description"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="card-action"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="card-content"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="card-footer"]')).not.toBeNull();
  });
});
