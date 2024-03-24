import { Article } from "@/schemas";
import { FC } from "hono/jsx";

export const ArticlesTable: FC<{ articles: Array<Article> }> = ({
  articles,
}) => {
  return (
    <table>
      <thead>
        <tr>
          <th>タイトル</th>
          <th>執筆者</th>
          <th>タグ</th>
          <th>いいね数</th>
          <th>ストック数</th>
        </tr>
      </thead>
      <tbody>
        {articles.map((article) => (
          <tr key={article.id}>
            <td>
              <a
                href={`https://qiita.com/${article.userId}/items/${article.id}`}
                target="_blank"
              >
                {article.title}
              </a>
            </td>
            <td>
              {article.userId}
              <span>{article.userName != "" && `(${article.userName})`}</span>
            </td>
            <td>
              <ul>
                {article.tags.map((tag) => (
                  <li key={`${article.id}-${tag.name}`}>
                    <a
                      href={`https://qiita.com/tags/${tag.name}`}
                      target="_blank"
                    >
                      {tag.name}
                    </a>
                  </li>
                ))}
              </ul>
            </td>
            <td>{article.likesCount}</td>
            <td>{article.stocksCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
