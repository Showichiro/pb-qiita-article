/** @jsxImportSource react */
import { Button } from "./ui";
import {
  periodOptions,
  periodRange,
  samePeriod,
  type PeriodRange,
} from "./period-shortcuts";
import {
  periodGroupClass,
  periodButtonClass,
  periodNoteClass,
  periodNote,
} from "./period-shortcuts-presentation";
export function PeriodShortcuts({
  range,
  onChange,
  dateOnly = false,
}: {
  range: PeriodRange;
  onChange: (range: PeriodRange) => void;
  dateOnly?: boolean;
}) {
  const now = new Date();
  return (
    <fieldset aria-label="期間を選択" className={periodGroupClass}>
      {periodOptions
        .filter((option) => !dateOnly || option.value !== "all")
        .map((option) => {
          const next = periodRange(option.value, dateOnly, now);
          const selected = samePeriod(range, next);
          return (
            <Button
              key={option.value}
              type="button"
              variant={selected ? "default" : "outline"}
              className={periodButtonClass}
              aria-pressed={selected}
              data-focus-id={`period-${option.value}`}
              onClick={() => onChange(periodRange(option.value, dateOnly))}
            >
              {option.label}
            </Button>
          );
        })}
      <p className={periodNoteClass}>{periodNote}</p>
    </fieldset>
  );
}
