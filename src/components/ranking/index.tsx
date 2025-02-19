import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import type { FC } from "hono/jsx";

export const Ranking: FC<{
  articleCountGroupByUsers: Array<ArticleCountGroupByUser>;
  likesCounts: Array<LikesCountSchema>;
}> = ({ articleCountGroupByUsers, likesCounts }) => {
  return (
    <>
      <div class="grid grid-rows-2 gap-4">
        <div>
          <h2 id="posts" class="text-3xl">
            記事数ランキング
          </h2>
          <table class="table overflow-x-auto table-zebra">
            <thead>
              <tr>
                <th>順位</th>
                <th>執筆者</th>
                <th>記事数</th>
              </tr>
            </thead>
            <tbody>
              {articleCountGroupByUsers.map((user, index) => (
                <tr key={`article-count-${user.userId}`}>
                  <td>{index + 1}</td>
                  <td>
                    <a
                      className="link"
                      href={`https://qiita.com/${user.userId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {user.userId}
                      <span>
                        {user.userName !== "" && `(${user.userName})`}
                      </span>
                    </a>
                  </td>
                  <td>{user.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2 id="likes" class="text-3xl">
            いいね数ランキング
          </h2>
          <table class="table overflow-x-auto table-zebra">
            <thead>
              <tr>
                <th>順位</th>
                <th>執筆者</th>
                <th>いいね数</th>
              </tr>
            </thead>
            <tbody>
              {likesCounts.map((user, index) => (
                <tr key={`likes-count-${user.userId}`}>
                  <td>{index + 1}</td>
                  <td>
                    <a
                      className="link"
                      href={`https://qiita.com/${user.userId}`}
                      rel="noopener noreferrer"
                    >
                      {user.userId}
                      <span>
                        {user.userName !== "" && `(${user.userName})`}
                      </span>
                    </a>
                  </td>
                  <td>{user.totalLikesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export const RankingRange: FC<{
  default: { since: string | null; until: string | null };
}> = ({ default: { since, until } }) => {
  return (
    <form action="/ranking" method="get">
      <label>
        <span class="mr-2">since:</span>
        <input type="date" name="since" value={since ?? undefined} />
      </label>
      <label class="ml-2">
        <span class="mr-2">until:</span>
        <input type="date" name="until" value={until ?? undefined} />
      </label>
      <div class="pt-4">
        <button class="btn btn-primary btn-sm" type="submit">
          検索する
        </button>
      </div>
    </form>
  );
};

export const RankingScrollMenu: FC = () => {
  return (
    <li>
      <details>
        <summary>Menu</summary>
        <ul class="p-2 bg-base-200 rounded-t-none w-56">
          <li>
            <a href="#posts">投稿数</a>
          </li>
          <li>
            <a href="#likes">いいね数</a>
          </li>
        </ul>
      </details>
    </li>
  );
};
