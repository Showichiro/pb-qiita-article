import { jsxRenderer } from "hono/jsx-renderer";
import styles from "./index.css?url";

export const renderer = jsxRenderer(
  ({ children, title }) => {
    return (
      <html data-theme="lemonade">
        <head>
          <link href={styles} rel="stylesheet" />
          <title>{title}</title>
        </head>
        <body>{children}</body>
      </html>
    );
  },
  {
    stream: true,
  }
);
