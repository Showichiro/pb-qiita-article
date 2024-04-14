import { Article } from "@/schemas";
import { html } from "hono/html";
import { FC } from "hono/jsx";

export const ArticlesTable: FC<{ articles: Array<Article> }> = ({
  articles,
}) => {
  return (
    <table class="table overflow-x-auto">
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
          <tr key={article.id} className="hover">
            <td>
              <a
                className="link"
                href={`https://qiita.com/${article.userId}/items/${article.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.title}
              </a>
            </td>
            <td>
              <a
                className="link"
                href={`https://qiita.com/${article.userId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.userId}
                <span>{article.userName != "" && `(${article.userName})`}</span>
              </a>
            </td>
            <td>
              <ul>
                {article.tags.map((tag) => (
                  <li
                    key={`${article.id}-${tag.name}`}
                    className="badge badge-lg"
                  >
                    <a
                      href={`https://qiita.com/tags/${tag.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
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

export const SelectBoxPageLimit: FC<{ page: number; limit: number }> = ({
  page,
  limit,
}) => {
  const script = html`
    <script>
      const page = ${page};
      const handleSelect = (e) => {
        const limit = e.target.value;
        const offset = (page - 1) * limit;
        const url = new URL(location.href);
        url.searchParams.set("limit", limit);
        url.searchParams.set("offset", offset);
        location.href = url.href;
      };
      const select = document.querySelector("select#page-limit");
      select.addEventListener("change", handleSelect);
    </script>
  `;
  return (
    <>
      <select
        class="select select-bordered"
        aria-label="page-limit"
        id="page-limit"
        name="page-limit"
      >
        {[10, 20, 30].map((l) => (
          <option selected={limit === l}>{l}</option>
        ))}
      </select>
      {script}
    </>
  );
};
