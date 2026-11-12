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
      open: d.by_eligibility.open,
      india_remote: d.by_eligibility.india_remote,
      applicable: d.by_eligibility.open + d.by_eligibility.india_remote,
      tech: d.tech_open_jobs,
    }));

  if (rows.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
        —
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatNumber(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#0c0c0e",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => formatNumber(Number(value))}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#a1a1aa", paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="applicable"
            name="Open + India remote"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="tech"
            name="Tech jobs"
            stroke="#71717a"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
