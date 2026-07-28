"use client";

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

export function RevenueChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="faturamentoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#24409E" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#24409E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          formatter={(value) => [
            Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            "Faturamento",
          ]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Area type="monotone" dataKey="faturamento" stroke="#24409E" strokeWidth={2} fill="url(#faturamentoFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [Number(value ?? 0), "Pedidos"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="pedidos" fill="#3A57B3" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
