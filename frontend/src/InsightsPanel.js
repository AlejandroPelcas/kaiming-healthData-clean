import { MISMATCH_TYPES, formatMoney, formatSignedMoney, shortPeriodLabel } from "./dashboard";

// Change since the previous month for the same plan. Every metric here is
// "smaller is better", compared by size so net variance works in either direction.
function Delta({ current, previous, previousRun, isMoney }) {
  if (!previousRun || previous == null) {
    return <span className="kpi-delta muted">No earlier month to compare</span>;
  }
  const when = shortPeriodLabel(previousRun.year, previousRun.month);
  const change = Math.abs(current) - Math.abs(previous);
  if (Math.abs(change) < 0.005) {
    return <span className="kpi-delta muted">Same as {when}</span>;
  }
  const better = change < 0;
  const amount = isMoney ? formatMoney(Math.abs(change)) : Math.abs(change);
  return (
    <span className={`kpi-delta ${better ? "better" : "worse"}`}>
      {better ? "▼" : "▲"} {amount} vs {when}
    </span>
  );
}

function netNote(net) {
  if (net > 0) return "Paycom deducted more than was billed";
  if (net < 0) return "The provider billed more than Paycom deducted";
  return "Payroll and invoice balance out";
}

function InsightsPanel({ run, previousRun, topRow, typeFilter, onTypeFilter }) {
  const percent = run.employees_compared
    ? Math.round((run.mismatch_count / run.employees_compared) * 100)
    : 0;

  const kpis = [
    {
      label: "Net variance",
      value: formatSignedMoney(run.net_variance),
      note: netNote(run.net_variance),
      field: "net_variance",
      isMoney: true,
    },
    {
      label: "Gross variance",
      value: formatMoney(run.gross_variance),
      note: "Every difference added up, ignoring direction",
      field: "gross_variance",
      isMoney: true,
    },
    {
      label: "Employees with a difference",
      value: run.mismatch_count,
      note: `${percent}% of ${run.employees_compared} compared`,
      field: "mismatch_count",
      isMoney: false,
    },
    {
      label: "Largest difference",
      value: topRow ? formatMoney(Math.abs(topRow.difference)) : formatMoney(0),
      note: topRow ? topRow.name ?? `Employee ${topRow.eecode}` : "No differences",
      field: "largest_variance",
      isMoney: true,
    },
  ];

  const types = Object.entries(MISMATCH_TYPES).map(([key, info]) => ({
    key,
    ...info,
    count: run[`${key}_count`] ?? 0,
  }));

  const toggleType = (key) => onTypeFilter(typeFilter === key ? "all" : key);

  return (
    <section className="section-card">
      <h2>Insights</h2>

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi">
            <p className="kpi-label">{kpi.label}</p>
            <p className="kpi-value">{kpi.value}</p>
            <p className="kpi-note">{kpi.note}</p>
            <Delta
              current={run[kpi.field]}
              previous={previousRun?.[kpi.field]}
              previousRun={previousRun}
              isMoney={kpi.isMoney}
            />
          </div>
        ))}
      </div>

      {run.mismatch_count > 0 && (
        <div className="breakdown">
          <h3>What kind of differences</h3>
          <div className="breakdown-bar">
            {types
              .filter((type) => type.count > 0)
              .map((type) => (
                <button
                  key={type.key}
                  type="button"
                  className={`seg seg-${type.key}`}
                  style={{ flexGrow: type.count }}
                  onClick={() => toggleType(type.key)}
                  aria-label={`Show ${type.label} (${type.count})`}
                  title={`${type.label}: ${type.count}`}
                />
              ))}
          </div>
          <div className="breakdown-legend">
            {types.map((type) => (
              <button
                key={type.key}
                type="button"
                className={`legend-item ${typeFilter === type.key ? "active" : ""}`}
                onClick={() => toggleType(type.key)}
                disabled={type.count === 0}
                title={type.hint}
                aria-pressed={typeFilter === type.key}
              >
                <span className={`swatch seg-${type.key}`} />
                {type.label}
                <strong>{type.count}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {run.one_paycheck_count > 0 && (
        <p className="callout">
          {run.one_paycheck_count === 1
            ? "1 difference equals"
            : `${run.one_paycheck_count} differences equal`}{" "}
          one paycheck's deduction. That usually means a deduction was missed or doubled on
          one of the two check registers. These rows are marked "One paycheck?" in the table.
        </p>
      )}
    </section>
  );
}

export default InsightsPanel;
