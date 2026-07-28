"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface DailyPoint {
  dia: string;
  faturamento: number;
  pedidos: number;
}

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  return {
    line: "#24409E",
    bar: isDark ? "#5E7ACB" : "#3A57B3",
    grid: isDark ? "#223049" : "#f1f5f9",
    tick: isDark ? "#6B7686" : "#94a3b8",
    tooltipBg: isDark ? "#16203A" : "#ffffff",
    tooltipBorder: isDark ? "#223049" : "#e2e8f0",
    tooltipText: isDark ? "#E8ECF2" : "#0f172a",
  };
}

export function RevenueChart({ data }: { data: DailyPoint[] }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="faturamentoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.line} stopOpacity={0.25} />
            <stop offset="95%" stopColor={c.line} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
        <XAxis dataKey="dia" tick={{ fontSize: 12, fill: c.tick }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: c.tick }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          formatter={(value) => [
            Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            "Faturamento",
          ]}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${c.tooltipBorder}`,
            fontSize: 13,
            background: c.tooltipBg,
            color: c.tooltipText,
          }}
        />
        <Area type="monotone" dataKey="faturamento" stroke={c.line} strokeWidth={2} fill="url(#faturamentoFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersChart({ data }: { data: DailyPoint[] }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
        <XAxis dataKey="dia" tick={{ fontSize: 12, fill: c.tick }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: c.tick }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [Number(value ?? 0), "Pedidos"]}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${c.tooltipBorder}`,
            fontSize: 13,
            background: c.tooltipBg,
            color: c.tooltipText,
          }}
        />
        <Bar dataKey="pedidos" fill={c.bar} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
