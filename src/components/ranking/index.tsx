import { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import { FC } from "hono/jsx";

export const Ranking: FC<{
  articleCountGroupByUsers: Array<ArticleCountGroupByUser>;
  likesCounts: Array<LikesCountSchema>;
}> = ({ articleCountGroupByUsers, likesCounts }) => {
  return (
    <>
      <h2>記事数ランキング</h2>
      <table>
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
                <a href={`https://qiita.com/${user.userId}`} target="_blank">
                  {user.userId}
                  <span>{user.userName != "" && `(${user.userName})`}</span>
                </a>
              </td>
              <td>{user.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>いいね数ランキング</h2>
      <table>
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
                <a href={`https://qiita.com/${user.userId}`}>
                  {user.userId}
                  <span>{user.userName != "" && `(${user.userName})`}</span>
                </a>
              </td>
              <td>{user.totalLikesCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export const RankingRange: FC<{
  default: { since: string | null; until: string | null };
}> = ({ default: { since, until } }) => {
  return (
    <form action="/ranking" method="GET">
      <input type="date" name="sinse" value={since ?? undefined} />
      ～
      <input type="date" name="until" value={until ?? undefined} />
      <button type="submit">検索する</button>
    </form>
  );
};
