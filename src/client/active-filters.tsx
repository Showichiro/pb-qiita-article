/** @jsxImportSource react */
import type { ActiveFilter } from "./filter-state";

export function ActiveFilters({
  filters,
  onRemove,
  onClear,
}: {
  filters: ActiveFilter[];
  onRemove: (filter: ActiveFilter) => void;
  onClear: () => void;
}) {
  if (!filters.length) return null;
  return (
    <fieldset className="active-filters" aria-label="適用中の絞り込み">
      {filters.map((filter) => (
        <button
          type="button"
          key={filter.key}
          className="filter-chip"
          aria-label={`${filter.label}を解除`}
          onClick={() => onRemove(filter)}
        >
          {filter.label}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="filter-clear" onClick={onClear}>
        条件をクリア
      </button>
    </fieldset>
  );
}
