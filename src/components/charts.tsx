import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '../../shared/format';

export const COLORS = { brand: '#237643', brandLight: '#8cce9f', amber: '#d97706', red: '#dc2626', blue: '#0284c7', grid: '#e7e5e4', axis: '#78716c' };

const tickStyle = { fill: COLORS.axis, fontSize: 12 };

export function ChartBox({ height = 260, children, empty }: { height?: number; children: React.ReactElement; empty?: boolean }) {
  if (empty) return <div className="flex items-center justify-center text-sm text-stone-400" style={{ height }}>Bu davrda ma’lumot yo‘q</div>;
  return <div style={{ height }} className="w-full"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

type Point = { label: string; value: number; sub?: string; highlight?: boolean };

export function SimpleBar({ data, unit = 'L', height, color = COLORS.brand, layout = 'vertical', valueFormat }: { data: Point[]; unit?: string; height?: number; color?: string; layout?: 'vertical' | 'horizontal'; valueFormat?: (n: number) => string }) {
  const fmt = valueFormat ?? ((n: number) => `${formatNumber(n, 2)} ${unit}`);
  const empty = data.every((d) => d.value === 0);
  if (layout === 'horizontal') {
    const h = height ?? Math.max(180, data.length * 36 + 30);
    return (
      <ChartBox height={h} empty={empty}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={COLORS.grid} />
          <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={96} tick={tickStyle} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: '#f5f5f4' }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>{data.map((d, i) => <Cell key={i} fill={color} />)}</Bar>
        </BarChart>
      </ChartBox>
    );
  }
  return (
    <ChartBox height={height} empty={empty}>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(l, p) => (p?.[0]?.payload?.sub ?? l) as string} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => <Cell key={i} fill={d.highlight ? COLORS.brand : COLORS.brandLight} />)}
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

export function MoneyChart({ data, currency, height = 280 }: { data: { label: string; sub: string; revenue: number; feedCost: number; expenses: number; revenueName: string }[]; currency: string; height?: number }) {
  const empty = data.every((d) => !d.revenue && !d.feedCost && !d.expenses);
  const hasExp = data.some((d) => d.expenses > 0);
  return (
    <ChartBox height={height} empty={empty}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => (v >= 1e6 ? `${formatNumber(v / 1e6, 1)}M` : v >= 1e3 ? `${formatNumber(v / 1e3, 0)}k` : String(v))} />
        <Tooltip formatter={(v, n) => [`${formatNumber(Number(v), 0)} ${currency}`, n]} labelFormatter={(l, p) => (p?.[0]?.payload?.sub ?? l) as string} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name={data[0]?.revenueName ?? 'Daromad'} fill={COLORS.brand} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="feedCost" name="Yemish xarajati" fill={COLORS.amber} radius={[4, 4, 0, 0]} maxBarSize={28} />
        {hasExp && <Line dataKey="expenses" name="Qo‘shimcha xarajat" stroke={COLORS.red} strokeWidth={2} dot={false} />}
      </ComposedChart>
    </ChartBox>
  );
}
