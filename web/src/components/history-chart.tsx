"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyStats } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function HistoryChart({ history }: { history: DailyStats[] | null }) {
  const rows = (history ?? [])
    .filter((d) => !d.is_backfill)
    .slice()
    .reverse()
    .map((d) => ({
      date: d.date.slice(5),
      applicable: d.by_eligibility.open + d.by_eligibility.india_remote,
      tech: d.tech_open_jobs,
    }));

  if (rows.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center font-mono text-sm text-mute">
        -
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#cfe3f2" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#5a7188", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#5a7188", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatNumber(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #cfe3f2",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value) => formatNumber(Number(value))}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#5a7188", paddingTop: 8 }} />
          <Line
            type="monotone"
            dataKey="applicable"
            name="Open + India remote"
            stroke="var(--mark)"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="tech"
            name="Tech jobs"
            stroke="#2f9bff"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
