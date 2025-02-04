import { jsxRenderer } from "hono/jsx-renderer";
import styles from "./index.css?url";

export const renderer = jsxRenderer(
  ({ children, title }) => {
    return (
      <html data-theme="lemonade" lang="ja">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" lang="en" content="qiita items" />
          <meta name="description" lang="ja" content="qiita items" />
          <link href={styles} rel="stylesheet" />
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
