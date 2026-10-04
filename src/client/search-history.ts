/** Replace only this screen's query parameters; preserve unrelated URL state. */
export function pushSearchUrl(
  params: URLSearchParams,
  current: URLSearchParams,
  keys: readonly string[],
): void {
  if (params.toString() === current.toString()) return;
  const url = new URL(window.location.href);
  for (const key of keys) url.searchParams.delete(key);
  params.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  window.history.pushState(null, "", url);
}

export function subscribePopState(onPop: () => void): () => void {
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}
