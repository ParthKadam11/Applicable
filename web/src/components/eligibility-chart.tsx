"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ELIGIBILITY_COLORS, ELIGIBILITY_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

type Props = {
  byEligibility: Record<string, number> | null | undefined;
};

export function EligibilityChart({ byEligibility }: Props) {
  const order = [
    "open",
    "india_remote",
    "india_onsite",
    "region_locked",
    "unclear",
  ];
  const data = order
    .filter((k) => (byEligibility?.[k] ?? 0) > 0)
    .map((k) => ({
      key: k,
      name: ELIGIBILITY_LABELS[k] ?? k,
      value: byEligibility?.[k] ?? 0,
      color: ELIGIBILITY_COLORS[k] ?? "#71717a",
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        —
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0c0c0e",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => formatNumber(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-zinc-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: d.color }}
              />
              {d.name}
            </span>
            <span className="font-mono text-zinc-200">
              {formatNumber(d.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
