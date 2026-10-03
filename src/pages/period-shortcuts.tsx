import type { FC } from "hono/jsx";
import {
  periodOptions,
  periodRange,
  samePeriod,
  type PeriodRange,
} from "@/client/period-shortcuts";
import {
  periodGroupClass,
  periodButtonClass,
} from "@/client/period-shortcuts-presentation";
import { buttonVariants } from "@/client/ui/classes";
export const NativePeriodShortcuts: FC<{
  range: PeriodRange;
  href: (range: PeriodRange) => string;
  dateOnly?: boolean;
}> = ({ range, href, dateOnly = false }) => {
  const now = new Date();
  return (
    <fieldset aria-label="期間を選択" class={periodGroupClass}>
      {periodOptions
        .filter((option) => !dateOnly || option.value !== "all")
        .map((option) => {
          const next = periodRange(option.value, dateOnly, now);
          const selected = samePeriod(range, next);
          return (
            <a
              key={option.value}
              href={href(next)}
              aria-current={selected ? "true" : undefined}
              data-focus-id={`period-${option.value}`}
              class={buttonVariants({
                variant: selected ? "default" : "outline",
                className: periodButtonClass,
              })}
            >
              {option.label}
            </a>
          );
        })}
    </fieldset>
  );
};
