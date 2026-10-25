import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  DIRECTION,
  LEDGER_STATUS,
  PLANS,
  directionColor,
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  monthName,
  padMonth,
  planLabel,
  shortPeriodLabel,
} from "./dashboard";

const WINDOWS = [6, 12, 24];

// "+$20", "-$13", "+$0.50", "-$1.2k": signed, whole dollars unless there are cents.
function gridMoney(value) {
  const sign = value > 0 ? "+" : "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}${formatCompactMoney(abs)}`;
  const cents = Math.round(abs * 100) % 100 !== 0;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}
const CATCH_UP = new Set(["settled", "partial_catch_up", "over_corrected"]);

function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(grid, employees) {
  const header = ["Employee code", "Name", ...grid.months.map((m) => shortPeriodLabel(m.year, m.month)),
    grid.metric === "all" ? "Open across plans" : "Balance"];
  const lines = employees.map((e) => [
    e.eecode,
    e.name ?? "",
    ...e.cells.map((c) => (c ? c.difference : "not compared")),
    grid.metric === "all" ? e.open_amount : e.balance,
  ]);
  const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `employee-differences-${grid.metric === "all" ? "all-plans" : planLabel(grid.metric).replace(/\s+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function cellTitle(cell, m, metric) {
  if (!cell) return `${monthName(m.month)} ${m.year}: not compared`;
  const parts = [`${monthName(m.month)} ${m.year}: ${formatSignedMoney(cell.difference)}`];
  if (metric !== "all") parts.push(`balance ${formatSignedMoney(cell.balance)}`);
  if (cell.status !== "clear") parts.push(LEDGER_STATUS[cell.status]);
  (cell.by_plan ?? []).forEach((p) =>
    parts.push(`${planLabel(p.metric)} ${formatSignedMoney(p.difference)} (balance ${formatSignedMoney(p.balance)})`)
  );
  return parts.join("\n");
}

// Employees down the side, months across the top, each cell that month's difference.
function EmployeeGrid({ plansWithRuns, refreshKey, onOpenRun, onOpenEmployee }) {
  const [metric, setMetric] = useState("all");
  const [months, setMonths] = useState(12);
  const [search, setSearch] = useState("");
  const [grid, setGrid] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .ledgerGrid(metric, months)
      .then((data) => !cancelled && setGrid(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [metric, months, refreshKey]);

  const employees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (grid?.employees ?? []).filter(
      (e) => !term || (e.name ?? "").toLowerCase().includes(term) || String(e.eecode).toLowerCase().includes(term)
    );
  }, [grid, search]);

  const maxAbs = useMemo(
    () => Math.max(0, ...employees.flatMap((e) => e.cells.map((c) => Math.abs(c?.difference ?? 0)))),
    [employees]
  );

  const plans = PLANS.filter((p) => plansWithRuns.has(p.code));
  const isAll = metric === "all";

  return (
    <section className="section-card">
      <h2>Employees by month</h2>
      <p className="chart-note">
        Each cell is that month's difference (payroll minus invoice). The last column is what's still open after
        catch-ups. Select a name for the full history{isAll ? "" : ", or a cell to open that month's comparison"}.
      </p>

      <div className="grid-controls">
        <label className="field">
          <span>Plan</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="all">All plans</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Months</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w} value={w}>Last {w}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          className="table-search"
          placeholder="Search name or employee code"
          aria-label="Search employees"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => downloadCsv(grid, employees)} disabled={!employees.length}>
          Download CSV
        </button>
      </div>

      <div className="grid-legend">
        <span><span className="swatch" style={{ background: `rgb(${DIRECTION.negative.color})` }} /> {DIRECTION.negative.label}</span>
        <span><span className="swatch" style={{ background: `rgb(${DIRECTION.positive.color})` }} /> {DIRECTION.positive.label}</span>
        <span><span className="catch-up-mark">↺</span> Catch-up</span>
        <span>— Not compared</span>
      </div>

      {error && <p className="form-error">{error}</p>}
      {grid && !employees.length && !error && (
        <p className="empty-state">
          {search ? "No employees match this search." : "No differences or open balances in these months."}
        </p>
      )}

      {grid && employees.length > 0 && (
        <div className="table-scroll ledger-scroll">
          <table className="ledger-grid">
            <thead>
              <tr>
                <th scope="col" className="sticky-col">Employee</th>
                {grid.months.map((m) => (
                  <th key={m.period} scope="col" className="num">{shortPeriodLabel(m.year, m.month)}</th>
                ))}
                <th scope="col" className="num balance-col">{isAll ? "Open balance" : "Balance"}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const open = e.open_amount > 0;
                return (
                  <tr key={e.eecode}>
                    <th scope="row" className="sticky-col">
                      <button type="button" className="employee-link" onClick={() => onOpenEmployee(e.eecode)}>
                        {e.name ?? "Name not found"}
                      </button>
                      <span className="employee-code">{e.eecode}</span>
                    </th>
                    {e.cells.map((cell, i) => {
                      const m = grid.months[i];
                      if (!cell) {
                        return <td key={m.period} className="num ledger-cell gap" title={cellTitle(cell, m, metric)}>—</td>;
                      }
                      const clickable = !isAll && cell.difference !== 0 && cell.run_id;
                      const content = (
                        <>
                          {cell.difference === 0 ? "·" : gridMoney(cell.difference)}
                          {CATCH_UP.has(cell.status) && <span className="catch-up-mark" aria-label="catch-up">↺</span>}
                        </>
                      );
                      return (
                        <td
                          key={m.period}
                          className={`num ledger-cell ${cell.difference === 0 ? "zero" : ""}`}
                          style={{ background: directionColor(cell.difference, maxAbs) }}
                          title={cellTitle(cell, m, metric)}
                        >
                          {clickable ? (
                            <button
                              type="button"
                              className="cell-button"
                              onClick={() => onOpenRun(cell.run_id, e.eecode)}
                              aria-label={`${e.name}, ${monthName(m.month)} ${m.year}: ${formatSignedMoney(cell.difference)}. Open comparison.`}
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                    <td className="num balance-col">
                      {open ? (
                        <span className="balance-open" title={e.open_plans.map((p) => `${planLabel(p.metric)}: ${formatSignedMoney(p.balance)}`).join("\n")}>
                          {isAll ? formatMoney(e.open_amount) : formatSignedMoney(e.balance)}
                          {isAll && e.open_plans.length > 1 && <span className="split"> {e.open_plans.length} plans</span>}
                        </span>
                      ) : (
                        <span className="balance-settled">Settled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {grid && employees.length > 0 && (
        <p className="helper-text table-footnote">
          {employees.length} {employees.length === 1 ? "employee" : "employees"} with a difference or an open balance,
          largest open balance first. Balances within $1 of zero count as settled.
          {!isAll && ` Showing ${planLabel(metric)} as of ${shortPeriodLabel(grid.months.at(-1).year, padMonth(grid.months.at(-1).month))}.`}
        </p>
      )}
    </section>
  );
}

export default EmployeeGrid;
