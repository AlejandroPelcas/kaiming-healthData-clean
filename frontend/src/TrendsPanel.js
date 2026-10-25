import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DIRECTION,
  LEDGER_STATUS,
  PLANS,
  directionColor,
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  outlierThreshold,
  periodIndex,
  periodLabel,
  planLabel,
  prefersReducedMotion,
  shortPeriodLabel,
} from "./dashboard";

const MAX_MONTHS = 12;
const round2 = (value) => Math.round(value * 100) / 100;

const MEASURES = {
  outstanding: {
    label: "Outstanding",
    note: "Each cell is what's still owed for that plan at the end of the month, after catch-ups. ✓ means nothing outstanding.",
  },
  net: {
    label: "Net",
    note: "Each cell is that month's differences added up with their signs, so a catch-up shows in the opposite color.",
  },
  gross: {
    label: "Gross",
    note: "Each cell is that month's differences added up ignoring direction, so a catch-up counts as another difference.",
  },
};

function TrendDot({ cx, cy, payload, index }) {
  if (cx == null || cy == null) return <g key={index} />;
  return (
    <circle key={index} cx={cx} cy={cy} r={payload.outlier ? 6 : 3.5}
      fill={payload.outlier ? "#be123c" : "#005baa"} stroke="#ffffff" strokeWidth={1.5} />
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{p.fullLabel}</strong>
      <span>Outstanding {formatMoney(p.outstanding)}</span>
      <span>Net {formatSignedMoney(p.net)}, gross {formatMoney(p.gross)}</span>
      <span>Open balances {p.open_count}, settled {p.settled_count}</span>
      {p.outlier && <span className="tooltip-flag">Unusually high month</span>}
    </div>
  );
}

function TrendsPanel({ ledgerSummary, openBalances, activeRun, onOpenPlanMonth, onOpenEmployee }) {
  const [scope, setScope] = useState("plan");
  const [measure, setMeasure] = useState("outstanding");
  const planCode = activeRun?.metric;
  const effectiveScope = planCode ? scope : "all";
  const animate = !prefersReducedMotion();

  const periods = useMemo(() => {
    const seen = new Map();
    ledgerSummary.forEach((s) => {
      const idx = periodIndex(s.year, s.month);
      if (!seen.has(idx)) seen.set(idx, { idx, label: shortPeriodLabel(s.year, s.month) });
    });
    return [...seen.values()].sort((a, b) => a.idx - b.idx).slice(-MAX_MONTHS);
  }, [ledgerSummary]);

  const lookup = useMemo(() => {
    const map = new Map();
    ledgerSummary.forEach((s) => map.set(`${s.metric}-${periodIndex(s.year, s.month)}`, s));
    return map;
  }, [ledgerSummary]);

  const plansWithData = PLANS.filter((p) => ledgerSummary.some((s) => s.metric === p.code));
  const maxValue = Math.max(1, ...ledgerSummary.map((s) => Math.abs(s[measure])));

  const trendData = useMemo(() => {
    const source = effectiveScope === "plan" ? ledgerSummary.filter((s) => s.metric === planCode) : ledgerSummary;
    const byPeriod = new Map();
    source.forEach((s) => {
      const idx = periodIndex(s.year, s.month);
      const p = byPeriod.get(idx) ?? {
        idx, label: shortPeriodLabel(s.year, s.month), fullLabel: periodLabel(s.year, s.month),
        outstanding: 0, net: 0, gross: 0, open_count: 0, settled_count: 0,
      };
      ["outstanding", "net", "gross", "open_count", "settled_count"].forEach((k) => (p[k] += s[k]));
      byPeriod.set(idx, p);
    });
    const points = [...byPeriod.values()].sort((a, b) => a.idx - b.idx)
      .map((p) => ({ ...p, outstanding: round2(p.outstanding), net: round2(p.net), gross: round2(p.gross) }));
    const threshold = outlierThreshold(points.map((p) => p.outstanding));
    return points.map((p) => ({ ...p, outlier: p.outstanding > threshold }));
  }, [ledgerSummary, effectiveScope, planCode]);

  const balanceRows = effectiveScope === "plan" ? openBalances.filter((b) => b.metric === planCode) : openBalances;
  const trendTitle = effectiveScope === "plan" ? `${planLabel(planCode)} by month` : "All plans by month";

  const cellStyle = (value) => {
    if (!value) return undefined;
    if (measure === "net") return { background: directionColor(value, maxValue) };
    const strength = Math.abs(value) / maxValue;
    return { background: `rgba(190, 18, 60, ${0.08 + strength * 0.62})`, color: strength > 0.5 ? "#ffffff" : undefined };
  };

  const cellText = (value) => {
    if (measure === "net") return `${value > 0 ? "+" : ""}${formatCompactMoney(value)}`;
    return formatCompactMoney(value);
  };

  return (
    <section className="section-card">
      <h2>History and trends</h2>

      <div className="trends-block">
        <div className="heading-row">
          <h3>Monthly history</h3>
          <div className="segmented" role="group" aria-label="Grid measure">
            {Object.entries(MEASURES).map(([key, m]) => (
              <button key={key} type="button" className={measure === key ? "selected" : ""}
                onClick={() => setMeasure(key)} aria-pressed={measure === key}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="chart-note">{MEASURES[measure].note} Select a cell to open that comparison.</p>
        <div className="table-scroll heatmap-scroll">
          <table className="heatmap">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                {periods.map((p) => <th key={p.idx} scope="col">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {plansWithData.map((plan) => (
                <tr key={plan.code}>
                  <th scope="row">{plan.label}</th>
                  {periods.map((p) => {
                    const s = lookup.get(`${plan.code}-${p.idx}`);
                    if (!s) return <td key={p.idx} className="heat-empty" title="Not compared">–</td>;
                    const value = s[measure];
                    const clean = measure !== "net" && value === 0;
                    const active = activeRun?.metric === plan.code && activeRun?.year === s.year && activeRun?.month === s.month;
                    return (
                      <td key={p.idx}>
                        <button
                          type="button"
                          className={`heat-cell ${clean ? "clean" : ""} ${active ? "active" : ""}`}
                          style={clean ? undefined : cellStyle(value)}
                          onClick={() => onOpenPlanMonth(plan.code, s.year, s.month)}
                          aria-label={`${plan.label}, ${periodLabel(s.year, s.month)}: ${MEASURES[measure].label.toLowerCase()} ${measure === "net" ? formatSignedMoney(value) : formatMoney(value)}`}
                        >
                          {clean ? "✓" : cellText(value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {measure === "net" && (
          <div className="grid-legend">
            <span><span className="swatch" style={{ background: `rgb(${DIRECTION.negative.color})` }} /> {DIRECTION.negative.label}</span>
            <span><span className="swatch" style={{ background: `rgb(${DIRECTION.positive.color})` }} /> {DIRECTION.positive.label}</span>
          </div>
        )}
      </div>

      <div className="trends-grid">
        <div>
          <div className="heading-row">
            <h3>{trendTitle}</h3>
            {planCode && (
              <div className="segmented" role="group" aria-label="Trend scope">
                <button type="button" className={scope === "plan" ? "selected" : ""} onClick={() => setScope("plan")} aria-pressed={scope === "plan"}>
                  {planLabel(planCode)}
                </button>
                <button type="button" className={scope === "all" ? "selected" : ""} onClick={() => setScope("all")} aria-pressed={scope === "all"}>
                  All plans
                </button>
              </div>
            )}
          </div>

          {trendData.length < 2 ? (
            <p className="empty-state">
              Trends appear once there are at least two months of comparisons
              {effectiveScope === "plan" ? ` for ${planLabel(planCode)}` : ""}.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e8eef7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="money" tickFormatter={formatCompactMoney} tick={{ fontSize: 12 }} width={56} />
                  <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="count" dataKey="open_count" name="Open balances" fill="#c7ddf3" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
                  <Line yAxisId="money" dataKey="outstanding" name="Outstanding" stroke="#005baa" strokeWidth={2.5}
                    dot={(props) => <TrendDot {...props} key={props.index} />} isAnimationActive={animate} />
                  <Line yAxisId="money" dataKey="gross" name="Gross" stroke="#94a3b8" strokeDasharray="5 4" dot={false} isAnimationActive={animate} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="chart-note">
                Outstanding drops when a catch-up lands; gross counts the catch-up as another difference. Red points
                mark months with unusually high outstanding balances.
                {effectiveScope === "all" && " Totals only include plans compared so far in each month."}
              </p>
            </>
          )}
        </div>

        <div>
          <h3>Open balances</h3>
          <p className="chart-note">
            Employees with a balance still open{effectiveScope === "plan" ? ` for ${planLabel(planCode)}` : ""} as
            of the latest month compared. Catch-ups usually land the following month, so one month open is normal.
          </p>
          {balanceRows.length === 0 ? (
            <p className="empty-state">Nothing open. Every difference has been caught up.</p>
          ) : (
            <div className="table-scroll offender-scroll">
              <table className="mismatch-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    {effectiveScope === "all" && <th>Plan</th>}
                    <th>Open for</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.map((b) => (
                    <tr key={`${b.metric}-${b.eecode}`}>
                      <td>
                        <button type="button" className="employee-link" onClick={() => onOpenEmployee(b.eecode)}>
                          {b.name ?? "Name not found"}
                        </button>
                        <div className="employee-code">{b.eecode}</div>
                      </td>
                      {effectiveScope === "all" && <td>{planLabel(b.metric)}</td>}
                      <td>
                        <span className={b.months_open > 1 ? "ongoing" : ""}>
                          {b.months_open} {b.months_open === 1 ? "month" : "months"}
                        </span>
                        <div className="split">
                          {b.status === "open" || b.status === "growing" || b.status === "new"
                            ? `since ${shortPeriodLabel(b.open_since.year, b.open_since.month)}`
                            : LEDGER_STATUS[b.status]}
                        </div>
                      </td>
                      <td className="num">{formatSignedMoney(b.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default TrendsPanel;