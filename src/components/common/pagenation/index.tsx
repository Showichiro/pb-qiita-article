import { FC } from "hono/jsx";

export const Pagenation: FC<{
  page: number;
  limit: number;
}> = ({ page, limit }) => {
  return (
    <div>
      <form action="/articles" method="get">
        <button
          type="submit"
          name="offset"
          value={(page - 2) * limit}
          disabled={page === 1}
        >
          Prev
        </button>
        <span>{page}</span>
        <button type="submit" name="offset" value={page * limit}>
          Next
        </button>
      </form>
    </div>
  );
};
