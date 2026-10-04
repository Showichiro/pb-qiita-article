/** @jsxImportSource react */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisMetric, AnalysisRow } from "./analysis";
import { analysisChartClass, analysisChartText } from "./analysis-presentation";

export function AnalysisChart({
  metric,
  rows,
}: {
  metric: AnalysisMetric;
  rows: AnalysisRow[];
}) {
  const likes = metric === "likes";
  const valueKey = likes ? "publishedArticleLikes" : "articleCount";
  const { label, description } = analysisChartText(metric);
  return (
    <figure aria-label={label}>
      <figcaption className="sr-only">{label}</figcaption>
      {description && <p className="mb-2 text-sm">{description}</p>}
      <div className={analysisChartClass}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer
            data={rows}
            margin={{ top: 12, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucketStart" />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(value) => [
                String(value ?? 0),
                likes ? "公開記事の現在のいいね数" : "公開記事数",
              ]}
              labelFormatter={(labelValue) => `期間開始日: ${labelValue}`}
            />
            <Line
              type="monotone"
              dataKey={valueKey}
              name={label}
              stroke="var(--color-primary, #0284c7)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
