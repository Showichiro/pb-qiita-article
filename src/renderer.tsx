import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script, ViteClient } from "vite-ssr-components/hono";

export const renderer = jsxRenderer(
  ({ children, title }) => {
    return (
      <html data-theme="lemonade" lang="ja">
        <head>
          <ViteClient />
          <Script src="/src/client/main.tsx" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" lang="en" content="qiita items" />
          <meta name="description" lang="ja" content="qiita items" />
          <Link href="/src/index.css" rel="stylesheet" />
          <title>{title}</title>
        </head>
        <body>{children}</body>
      </html>
    );
  },
  {
    stream: true,
  },
);
