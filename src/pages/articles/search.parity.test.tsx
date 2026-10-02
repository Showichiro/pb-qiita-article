// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { articleQueryParams, type ArticleQuery } from "@/client/articles";
import type { ArticlesAppProps } from "@/client/ArticlesApp";
import type { Article } from "@/schemas";
import { renderer } from "@/util";
import { ArticlesSearch } from "./search";

const article: Article = {
  id: "a<b>",
  title: "<記事>",
  userId: "writer",
  userName: "Author",
  createdAt: "2026-10-01T12:00:00.000Z",
  likesCount: 3,
  stocksCount: 4,
  tags: [{ name: "C#" }],
};

const query: ArticleQuery = {
  q: "react",
  author: "writer",
  tags: ["C#", "a,b"],
  minLikes: 0,
  maxLikes: 10,
  minStocks: 1,
  maxStocks: null,
  since: "2026-01-01",
  until: "2026-10-01",
  orderField: "stocksCount",
  orderDirection: "asc",
  limit: 1,
  offset: 0,
};
const tagOptions = ["C#", "a,b", "TypeScript"];

const presentationSelectors = [
  "section.react-island",
  "[data-slot='card']",
  "form",
  "[name='q']",
  "[name='author']",
  "label[for='articles-tags']",
  "[data-slot='select-wrapper']",
  "[name='tags']",
  "[name='minLikes']",
  "[name='maxLikes']",
  "[name='minStocks']",
  "[name='maxStocks']",
  "[name='since']",
  "[name='until']",
  "[name='orderField']",
  "[name='orderDirection']",
  "[name='limit']",
  "[name='offset']",
  "button[type='submit']",
  "[role='status']",
  "table",
  "[data-slot='table-container']",
  "thead",
  "tbody",
  "th",
  "td",
  "tbody tr",
  "td a",
  "td li",
  "nav",
];

function host(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

function presentation(html: string) {
  const element = host(html);
  return Object.fromEntries(
    presentationSelectors.map((selector) => {
      const found = element.querySelector(selector);
      if (!found) throw new Error(`Missing ${selector}`);
      return [
        selector,
        {
          className: found.getAttribute("class"),
          slot: found.getAttribute("data-slot"),
        },
      ];
    }),
  );
}

async function reactMarkup(
  next: ArticleQuery,
  articles: Article[],
): Promise<string> {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ArticlesApp } = await import("@/client/ArticlesApp");
  return renderToStaticMarkup(
    createElement<ArticlesAppProps>(ArticlesApp, {
      initialConfig: next,
      initialArticles: articles,
      initialTagOptions: tagOptions,
    }),
  );
}

describe("articles SSR presentation parity", () => {
  it("serves island styles with the shell stylesheet", () => {
    const shell = readFileSync("src/index.css", "utf8");
    const island = readFileSync("src/client/ui.css", "utf8");
    const importAt = shell.indexOf('@import "./client/ui.css"');
    expect(importAt).toBeGreaterThan(-1);
    expect(importAt).toBeLessThan(shell.indexOf("@plugin"));
    expect(island).toContain(".react-island");
    expect(island).toContain('[data-slot="card"]');
    expect(island).toContain('[data-slot="input"]');
  });

  it("matches the React island classes, count, tags and controls", async () => {
    const { text } = await renderer(
      <ArticlesSearch
        query={query}
        articles={[article]}
        tagOptions={tagOptions}
      />,
    );
    const react = await reactMarkup(query, [article]);
    expect(presentation(text)).toEqual(presentation(react));

    const ssr = host(text);
    const enhanced = host(react);
    expect(ssr.querySelector("form")?.getAttribute("action")).toBe("/articles");
    expect(ssr.querySelector("form")?.getAttribute("method")).toBe("get");
    for (const name of ["q", "author"] as const) {
      expect(ssr.querySelector(`[name='${name}']`)?.getAttribute("value")).toBe(
        query[name],
      );
      expect(
        enhanced.querySelector(`[name='${name}']`)?.getAttribute("value"),
      ).toBe(query[name]);
    }
    const selectedTags = (root: HTMLElement) =>
      Array.from(
        root.querySelectorAll("[name='tags'] option[selected]"),
        (option) => option.getAttribute("value"),
      );
    expect(selectedTags(ssr)).toEqual(query.tags);
    expect(selectedTags(enhanced)).toEqual(query.tags);
    for (const root of [ssr, enhanced]) {
      const tags = root.querySelector("[name='tags']");
      expect(tags?.getAttribute("multiple")).not.toBeNull();
      expect(tags?.getAttribute("size")).toBe("4");
      expect(
        tags?.parentElement?.querySelector("[data-slot='select-icon']"),
      ).toBeNull();
    }
    for (const name of [
      "minLikes",
      "maxLikes",
      "minStocks",
      "maxStocks",
    ] as const) {
      expect(ssr.querySelector(`[name='${name}']`)?.getAttribute("value")).toBe(
        query[name] === null ? "" : String(query[name]),
      );
      expect(
        enhanced.querySelector(`[name='${name}']`)?.getAttribute("value"),
      ).toBe(query[name] === null ? "" : String(query[name]));
    }
    expect(
      ssr.querySelector("[role='status'] + [role='status']")?.textContent?.trim(),
    ).toBe("1件");
    expect(
      enhanced
        .querySelector("[role='status'] + [role='status']")
        ?.textContent?.trim(),
    ).toBe("1件");
    expect(
      ssr
        .querySelector("[name='orderField'] option[selected]")
        ?.getAttribute("value"),
    ).toBe("stocksCount");
    expect(
      ssr
        .querySelector("[name='orderDirection'] option[selected]")
        ?.getAttribute("value"),
    ).toBe("asc");
    expect(ssr.querySelector("[name='since']")?.getAttribute("value")).toBe(
      "2026-01-01",
    );
    expect(ssr.querySelector("td a")?.getAttribute("href")).toBe(
      "https://qiita.com/writer/items/a%3Cb%3E",
    );
    expect(ssr.querySelector("td li a")?.getAttribute("href")).toBe(
      "https://qiita.com/tags/C%23",
    );
    expect(ssr.textContent).toContain("2026-10-01");
    expect(ssr.textContent).toContain("<記事>");
    expect(ssr.querySelector("[name='offset']")?.getAttribute("value")).toBe(
      "0",
    );

    const next = ssr.querySelector("nav a");
    expect(next?.textContent).toBe("次へ");
    expect(next?.getAttribute("class")).toBe(
      enhanced.querySelector("nav button:last-of-type")?.getAttribute("class"),
    );
    expect(next?.getAttribute("href")).toBe(
      `/articles?${articleQueryParams({ ...query, offset: query.limit })}`,
    );
    expect(ssr.querySelector("nav button")?.textContent).toBe("前へ");
    expect(ssr.querySelector("nav button")?.hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("keeps the previous page on an anchor and resets search offset", async () => {
    const paged = { ...query, offset: 2 };
    const { text } = await renderer(
      <ArticlesSearch
        query={paged}
        articles={[]}
        tagOptions={tagOptions}
      />,
    );
    const element = host(text);
    expect(element.querySelector("[name='offset']")?.getAttribute("value")).toBe(
      "0",
    );
    const previous = element.querySelector("nav a");
    expect(previous?.textContent).toBe("前へ");
    expect(previous?.getAttribute("href")).toBe(
      `/articles?${articleQueryParams({ ...paged, offset: 1 })}`,
    );
    const react = host(await reactMarkup(paged, [article]));
    expect(previous?.getAttribute("class")).toBe(
      react.querySelector("nav button")?.getAttribute("class"),
    );
    expect(element.querySelectorAll("nav a")).toHaveLength(1);
    expect(element.querySelector("nav button")?.textContent).toBe("次へ");
  });

  it("matches the empty result placeholder", async () => {
    const { text } = await renderer(
      <ArticlesSearch
        query={query}
        articles={[]}
        tagOptions={tagOptions}
      />,
    );
    const react = await reactMarkup(query, []);
    const ssr = host(text);
    const enhanced = host(react);
    expect(ssr.textContent).toContain("該当する記事はありません。");
    expect(ssr.textContent).toContain("0件");
    expect(enhanced.textContent).toContain("0件");
    expect(ssr.querySelector("table")?.getAttribute("class")).toBe(
      enhanced.querySelector("table")?.getAttribute("class"),
    );
    expect(ssr.querySelector("nav a")).toBeNull();
  });
});
