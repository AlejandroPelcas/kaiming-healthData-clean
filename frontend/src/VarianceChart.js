import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MISMATCH_TYPES,
  formatMoney,
  formatSignedMoney,
  outlierThreshold,
  prefersReducedMotion,
} from "./dashboard";

const MAX_BARS = 15;

function shortenName(name) {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

// Round the axis end up to 1, 2, 2.5 or 5 times a power of ten so ticks land on even amounts.
function niceCeiling(value) {
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value);
  return step * power;
}

function axisMoney(value) {
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString()}`;
}

function VarianceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{row.name ?? `Employee ${row.eecode}`}</strong>
      <span>{MISMATCH_TYPES[row.mismatch_type]?.label}</span>
      <span>Payroll {formatMoney(row.payroll)}</span>
      <span>Invoice {formatMoney(row.invoice)}</span>
      <span>Difference {formatSignedMoney(row.difference)}</span>
      {row.outlier && <span className="tooltip-flag">Much larger than the other differences</span>}
      {row.one_paycheck && <span className="tooltip-flag">Equals one paycheck's deduction</span>}
    </div>
  );
}

// Right of zero: Paycom deducted more than billed. Left: billed more than deducted.
// Color shows the mismatch type; full color marks differences that stand out.
function VarianceChart({ rows, selectedEecode, onSelect }) {
  const threshold = useMemo(
    () => outlierThreshold(rows.map((row) => Math.abs(row.difference))),
    [rows]
  );

  const data = useMemo(
    () =>
      [...rows]
        .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
        .slice(0, MAX_BARS)
        .map((row) => ({
          ...row,
          label: shortenName(row.name ?? row.eecode),
          outlier: Math.abs(row.difference) > threshold,
        })),
    [rows, threshold]
  );

  // Same scale on both sides of zero so left and right bars compare fairly.
  const extent = niceCeiling(Math.max(1, ...data.map((row) => Math.abs(row.difference))));
  const ticks = [-extent, -extent / 2, 0, extent / 2, extent];

  const outlierCount = rows.filter((row) => Math.abs(row.difference) > threshold).length;
  const canFlag = Number.isFinite(threshold);

  if (rows.length === 0) {
    return <p className="empty-state">Nothing to chart. Every employee matched.</p>;
  }

  return (
    <div>
      <p className="chart-note">
        Bars to the right mean Paycom deducted more than was billed; bars to the left mean the
        provider billed more.{" "}
        {canFlag
          ? outlierCount
            ? `${outlierCount} ${outlierCount === 1 ? "difference stands" : "differences stand"} out from the rest and ${outlierCount === 1 ? "is" : "are"} shown in full color.`
            : "No single difference stands out from the rest."
          : "Unusually large differences are highlighted once there are at least four."}
        {rows.length > MAX_BARS && ` Showing the ${MAX_BARS} largest of ${rows.length}.`}
      </p>

      <ResponsiveContainer width="100%" height={data.length * 30 + 48}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke="#e8eef7" />
          <XAxis
            type="number"
            domain={[-extent, extent]}
            ticks={ticks}
            tickFormatter={axisMoney}
            tick={{ fontSize: 12 }}
          />
          <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12 }} interval={0} />
          <ReferenceLine x={0} stroke="#64748b" />
          <Tooltip content={<VarianceTooltip />} cursor={{ fill: "rgba(0, 91, 170, 0.06)" }} />
          <Bar
            dataKey="difference"
            cursor="pointer"
            isAnimationActive={!prefersReducedMotion()}
            onClick={(entry) => onSelect(entry?.payload?.eecode ?? entry?.eecode)}
          >
            {data.map((row) => (
              <Cell
                key={row.eecode}
                fill={MISMATCH_TYPES[row.mismatch_type]?.color ?? "#64748b"}
                fillOpacity={!canFlag || row.outlier ? 1 : 0.4}
                stroke={row.eecode === selectedEecode ? "#172033" : "none"}
                strokeWidth={2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="chart-legend">
        {Object.entries(MISMATCH_TYPES).map(([key, info]) => (
          <span key={key}>
            <span className={`swatch seg-${key}`} /> {info.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default VarianceChart;
