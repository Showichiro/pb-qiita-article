import { createElement } from "react";
import ArticlesApp, { type ArticlesAppProps } from "./ArticlesApp";
import { QueryProvider, getQueryClient, seedQueryData } from "./query-client";
import { articlesQueryKey, normalizeArticleQuery } from "./queries";
import { configQueryParams, parseArticleQuery } from "./articles";

export function articleTestElement(props: Partial<ArticlesAppProps>) {
  const fullProps = { initialDataVersion: "v1", initialArticles: [], ...props };
  const query = normalizeArticleQuery(
    props.initialConfig === undefined
      ? parseArticleQuery(new URLSearchParams(window.location.search))
      : parseArticleQuery(configQueryParams(props.initialConfig)),
  );
  seedQueryData(articlesQueryKey(fullProps.initialDataVersion, query), {
    query,
    rows: fullProps.initialArticles,
  });
  return createElement(
    QueryProvider,
    null,
    createElement(ArticlesApp, fullProps),
  );
}

export function resetTestQueries() {
  getQueryClient().clear();
  getQueryClient().setQueryData(["data-version"], { dataVersion: "v1" });
}
