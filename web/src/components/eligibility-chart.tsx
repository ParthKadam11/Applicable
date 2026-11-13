"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartEmpty } from "@/components/ui/skeleton";
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
      color: ELIGIBILITY_COLORS[k] ?? "#8aa0b4",
    }));

  if (data.length === 0) {
    return <ChartEmpty label="No eligibility mix yet" />;
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
              innerRadius="55%"
              outerRadius="82%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={3}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #cfe3f2",
                borderRadius: 12,
                fontSize: 12,
                color: "#06203a",
              }}
              formatter={(value) => formatNumber(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-mute">
              <span className="size-2 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="font-mono tabular-nums text-ink">
              {formatNumber(d.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
