/** @jsxImportSource react */
import { mountArticlesApp } from "./mount";

// Pages without an articles island require no React root or application import.
function start() {
  const container = document.getElementById("articles-app");
  if (container) {
    void mountArticlesApp(container).catch((error: unknown) => {
      console.error("Could not start the articles application", error);
    });
  }
}

// Wait for the entire streamed document, including the JSON bootstrap.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
