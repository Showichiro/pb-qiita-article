import type { ActiveFilter } from "@/client/filter-state";
import type { FC } from "hono/jsx";

export const NativeActiveFilters: FC<{
  filters: ActiveFilter[];
  href: (filter: ActiveFilter | null) => string;
}> = ({ filters, href }) =>
  filters.length ? (
    <div class="active-filters" aria-label="適用中の絞り込み">
      {filters.map((filter) => (
        <a
          key={filter.key}
          class="filter-chip"
          href={href(filter)}
          aria-label={`${filter.label}を解除`}
        >
          {filter.label}
          <span aria-hidden="true">×</span>
        </a>
      ))}
      <a class="filter-clear" href={href(null)}>
        条件をクリア
      </a>
    </div>
  ) : null;
