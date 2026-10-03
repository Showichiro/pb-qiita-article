import { z } from "zod";

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  created_at: z.string(),
  likes_count: z.number().int().nonnegative(),
  stocks_count: z.number().int().nonnegative(),
  user: z.object({ id: z.string().min(1), name: z.string().nullable() }),
  tags: z.array(z.object({ name: z.string().min(1) })),
});

export type Article = {
  id: string;
  title: string;
  userId: string;
  userName: string;
  createdAt: string;
  likesCount: number;
  stocksCount: number;
  tags: string[];
};

// Return only a complete, validated snapshot. Never expose a partial result.
export async function fetchQiitaArticles(
  token: string,
  request: typeof fetch = fetch,
): Promise<Article[]> {
  if (!token?.trim()) throw new Error("QIITA_API_KEY is not set");
  const articles: Article[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 100; page++) {
    const url = new URL("https://qiita.com/api/v2/items");
    url.searchParams.set("query", "org:primebrains");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Qiita page ${page}: HTTP ${response.status}`);
    const count = response.headers.get("Total-Count");
    if (count !== null) {
      if (!/^\d+$/.test(count)) throw new Error("Invalid Qiita Total-Count");
      const nextTotal = Number(count);
      if (total !== undefined && total !== nextTotal)
        throw new Error("Qiita Total-Count changed during pagination");
      total = nextTotal;
      if (total > 10_000) throw new Error("Qiita pagination limit exceeded");
    }
    const items = z
      .array(itemSchema)
      .max(100)
      .parse(await response.json());
    for (const item of items) {
      if (ids.has(item.id))
        throw new Error("Duplicate Qiita article during pagination");
      ids.add(item.id);
      articles.push({
        id: item.id,
        title: item.title,
        userId: item.user.id,
        userName: item.user.name ?? "",
        createdAt: item.created_at,
        likesCount: item.likes_count,
        stocksCount: item.stocks_count,
        tags: [...new Set(item.tags.map((tag) => tag.name))].sort(),
      });
    }
    const hasNext = /rel="next"/.test(response.headers.get("Link") ?? "");
    if (
      items.length < 100 ||
      (total !== undefined && articles.length >= total)
    ) {
      if (hasNext || (total !== undefined && articles.length !== total))
        throw new Error("Incomplete Qiita snapshot");
      return articles;
    }
    // A full final page at the API limit needs an explicit completion signal.
    if (page === 100) throw new Error("Cannot confirm complete Qiita snapshot");
  }
  throw new Error("Qiita pagination limit exceeded");
}
