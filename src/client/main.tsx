/** @jsxImportSource react */
import { mountArticlesApp } from "./mount";
import { mountRankingApp } from "./ranking-mount";

// Pages without an articles/ranking island require no React root or application import.
function start() {
  const articlesContainer = document.getElementById("articles-app");
  if (articlesContainer) {
    void mountArticlesApp(articlesContainer).catch((error: unknown) => {
      console.error("Could not start the articles application", error);
    });
  }

  const rankingContainer = document.getElementById("ranking-app");
  if (rankingContainer) {
    void mountRankingApp(rankingContainer).catch((error: unknown) => {
      console.error("Could not start the ranking application", error);
    });
  }
}

// Wait for the entire streamed document, including the JSON bootstrap.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
