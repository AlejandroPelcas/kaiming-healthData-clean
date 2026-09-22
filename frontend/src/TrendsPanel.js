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
  PLANS,
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

function TrendDot({ cx, cy, payload, index }) {
  if (cx == null || cy == null) return <g key={index} />;
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={payload.outlier ? 6 : 3.5}
      fill={payload.outlier ? "#be123c" : "#005baa"}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{point.fullLabel}</strong>
      <span>Gross variance {formatMoney(point.gross)}</span>
      <span>Net variance {formatSignedMoney(point.net)}</span>
      <span>Employees with a difference {point.mismatches}</span>
      {point.outlier && <span className="tooltip-flag">Unusually high month</span>}
    </div>
  );
}

function TrendsPanel({ runs, activeRun, offenders, onOpenRun }) {
  const [scope, setScope] = useState("plan");
  const planCode = activeRun?.metric;
  const effectiveScope = planCode ? scope : "all";
  const animate = !prefersReducedMotion();

  // Columns for the history grid: the most recent months that have any comparison.
  const periods = useMemo(() => {
    const seen = new Map();
    runs.forEach((run) => {
      const idx = periodIndex(run.year, run.month);
      if (!seen.has(idx)) {
        seen.set(idx, { idx, year: run.year, month: run.month, label: shortPeriodLabel(run.year, run.month) });
      }
    });
    return [...seen.values()].sort((a, b) => a.idx - b.idx).slice(-MAX_MONTHS);
  }, [runs]);

  const runLookup = useMemo(() => {
    const lookup = new Map();
    runs.forEach((run) => lookup.set(`${run.metric}-${periodIndex(run.year, run.month)}`, run));
    return lookup;
  }, [runs]);

  const plansWithRuns = PLANS.filter((plan) => runs.some((run) => run.metric === plan.code));
  const maxGross = Math.max(1, ...runs.map((run) => run.gross_variance));

  const trendData = useMemo(() => {
    const source = effectiveScope === "plan" ? runs.filter((run) => run.metric === planCode) : runs;
    const byPeriod = new Map();
    source.forEach((run) => {
      const idx = periodIndex(run.year, run.month);
      const point = byPeriod.get(idx) ?? {
        idx,
        label: shortPeriodLabel(run.year, run.month),
        fullLabel: periodLabel(run.year, run.month),
        gross: 0,
        net: 0,
        mismatches: 0,
      };
      point.gross += run.gross_variance;
      point.net += run.net_variance;
      point.mismatches += run.mismatch_count;
      byPeriod.set(idx, point);
    });

    const points = [...byPeriod.values()]
      .sort((a, b) => a.idx - b.idx)
      .map((point) => ({ ...point, gross: round2(point.gross), net: round2(point.net) }));
    const threshold = outlierThreshold(points.map((point) => point.gross));
    return points.map((point) => ({ ...point, outlier: point.gross > threshold }));
  }, [runs, effectiveScope, planCode]);

  const offenderRows =
    effectiveScope === "plan" ? offenders.filter((row) => row.metric === planCode) : offenders;

  const trendTitle =
    effectiveScope === "plan" ? `${planLabel(planCode)} by month` : "All plans by month";

  return (
    <section className="section-card">
      <h2>History and trends</h2>

      <div className="trends-block">
        <h3>Monthly history</h3>
        <p className="chart-note">
          Each cell is that month's gross variance for the plan. Darker means larger. ✓ means
          everything matched. Select a cell to open that comparison.
        </p>
        <div className="table-scroll heatmap-scroll">
          <table className="heatmap">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                {periods.map((period) => (
                  <th key={period.idx} scope="col">
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plansWithRuns.map((plan) => (
                <tr key={plan.code}>
                  <th scope="row">{plan.label}</th>
                  {periods.map((period) => {
                    const run = runLookup.get(`${plan.code}-${period.idx}`);
                    if (!run) {
                      return (
                        <td key={period.idx} className="heat-empty" title="Not compared">
                          –
                        </td>
                      );
                    }
                    const clean = run.mismatch_count === 0;
                    const intensity = run.gross_variance / maxGross;
                    return (
                      <td key={period.idx}>
                        <button
                          type="button"
                          className={`heat-cell ${clean ? "clean" : ""} ${activeRun?.id === run.id ? "active" : ""}`}
                          style={
                            clean
                              ? undefined
                              : {
                                  background: `rgba(190, 18, 60, ${0.08 + intensity * 0.62})`,
                                  color: intensity > 0.5 ? "#ffffff" : undefined,
                                }
                          }
                          onClick={() => onOpenRun(run.id)}
                          aria-label={`${plan.label}, ${periodLabel(run.year, run.month)}: ${
                            clean ? "everything matched" : `${formatMoney(run.gross_variance)} gross variance`
                          }`}
                        >
                          {clean ? "✓" : formatCompactMoney(run.gross_variance)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="trends-grid">
        <div>
          <div className="heading-row">
            <h3>{trendTitle}</h3>
            {planCode && (
              <div className="segmented" role="group" aria-label="Trend scope">
                <button
                  type="button"
                  className={scope === "plan" ? "selected" : ""}
                  onClick={() => setScope("plan")}
                  aria-pressed={scope === "plan"}
                >
                  {planLabel(planCode)}
                </button>
                <button
                  type="button"
                  className={scope === "all" ? "selected" : ""}
                  onClick={() => setScope("all")}
                  aria-pressed={scope === "all"}
                >
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
                  <Bar yAxisId="count" dataKey="mismatches" name="Employees with a difference" fill="#c7ddf3" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
                  <Line yAxisId="money" dataKey="gross" name="Gross variance" stroke="#005baa" strokeWidth={2} dot={(props) => <TrendDot {...props} key={props.index} />} isAnimationActive={animate} />
                  <Line yAxisId="money" dataKey="net" name="Net variance" stroke="#64748b" strokeDasharray="5 4" dot={false} isAnimationActive={animate} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="chart-note">
                Red points mark months with unusually high gross variance.
                {effectiveScope === "all" && " Totals only include plans compared so far in each month."}
              </p>
            </>
          )}
        </div>

        <div>
          <h3>Repeat differences</h3>
          <p className="chart-note">
            Employees with a difference in two or more months in a row
            {effectiveScope === "plan" ? ` for ${planLabel(planCode)}` : ""}. Ongoing means it's
            still showing up in the latest month compared.
          </p>
          {offenderRows.length === 0 ? (
            <p className="empty-state">No one has a difference two months in a row.</p>
          ) : (
            <div className="table-scroll offender-scroll">
              <table className="mismatch-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    {effectiveScope === "all" && <th>Plan</th>}
                    <th>Months in a row</th>
                    <th className="num">Latest</th>
                  </tr>
                </thead>
                <tbody>
                  {offenderRows.map((row) => (
                    <tr key={`${row.metric}-${row.eecode}`}>
                      <td>
                        <div className="employee-name">{row.name ?? "Name not found"}</div>
                        <div className="employee-code">{row.eecode}</div>
                      </td>
                      {effectiveScope === "all" && <td>{planLabel(row.metric)}</td>}
                      <td>
                        {row.current_streak > 0 ? (
                          <span className="ongoing">{row.current_streak}, ongoing</span>
                        ) : (
                          `${row.longest_streak}, ended`
                        )}
                      </td>
                      <td className="num">
                        {formatSignedMoney(row.latest_difference)}
                        <div className="split">{shortPeriodLabel(row.latest_year, row.latest_month)}</div>
                      </td>
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
