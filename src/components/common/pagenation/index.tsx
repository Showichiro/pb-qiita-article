import type { OrderByField, OrderDirection } from "@/db";
import type { FC } from "hono/jsx";

export const Pagenation: FC<{
  page: number;
  limit: number;
  since: string | null;
  until: string | null;
  orderField?: OrderByField | null;
  orderDirection?: OrderDirection | null;
}> = ({ page, limit, since, until, orderDirection, orderField }) => {
  return (
    <div className="join">
      <form action="/articles" method="get">
        {since != null && <input type="hidden" name="since" value={since} />}
        {until != null && <input type="hidden" name="until" value={until} />}
        {orderDirection != null && (
          <input
            type="hidden"
            name="orderDirection"
            value={orderDirection ?? ""}
          />
        )}
        {orderField != null && (
          <input type="hidden" name="orderField" value={orderField} />
        )}
        <input type="hidden" name="limit" value={limit} />
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
