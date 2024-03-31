import { FC } from "hono/jsx";

export const Pagenation: FC<{
  page: number;
  limit: number;
}> = ({ page, limit }) => {
  return (
    <div className="join">
      <form action="/articles" method="get">
        <button
          type="submit"
          name="offset"
          value={(page - 2) * limit}
          disabled={page === 1}
          className="join-item btn"
        >
          Prev
        </button>
        <span className="join-item btn">{page}</span>
        <button
          className="join-item btn"
          type="submit"
          name="offset"
          value={page * limit}
        >
          Next
        </button>
      </form>
    </div>
  );
};
