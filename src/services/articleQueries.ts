import {
  findAllArticles,
  findArticleTags,
  type FindAllArticlesConfig,
} from "@/db";
import {
  configQueryParams,
  normalizeTags,
  parseArticleQuery,
} from "@/client/articles";

type ArticleDataSource = {
  findAllArticles: typeof findAllArticles;
  findArticleTags: typeof findArticleTags;
};

// API and native bootstrap use the same normalized search and database query.
export async function loadArticles(
  db: Parameters<typeof findAllArticles>[0],
  config: FindAllArticlesConfig,
  dataVersion: string,
  source: Pick<ArticleDataSource, "findAllArticles"> = { findAllArticles },
) {
  const query = parseArticleQuery(configQueryParams(config));
  const articles = await source.findAllArticles(db, dataVersion, {
    ...query,
    since: query.since || null,
    until: query.until || null,
  });
  return { config: query, articles };
}

export async function loadArticlesPageData(
  db: Parameters<typeof findAllArticles>[0],
  config: FindAllArticlesConfig,
  dataVersion: string,
  publishedSequence: number,
  source: ArticleDataSource = { findAllArticles, findArticleTags },
) {
  const { config: query, articles } = await loadArticles(
    db,
    config,
    dataVersion,
    source,
  );
  const tags = await source.findArticleTags(db, dataVersion);
  return {
    config: query,
    articles,
    tagOptions: normalizeTags([...tags, ...query.tags]),
    dataVersion,
    publishedSequence,
  };
}

export type ArticlesPageData = Awaited<ReturnType<typeof loadArticlesPageData>>;
