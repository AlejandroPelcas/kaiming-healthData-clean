import { useEffect, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api";
import {
  DIRECTION,
  LEDGER_STATUS,
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  monthName,
  planLabel,
  prefersReducedMotion,
  shortPeriodLabel,
} from "./dashboard";

function HistoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{monthName(m.month)} {m.year}</strong>
      <span>Payroll {formatMoney(m.payroll)}, invoice {formatMoney(m.invoice)}</span>
      <span>Difference {formatSignedMoney(m.difference)}</span>
      <span>Running balance {formatSignedMoney(m.balance)}</span>
      {m.status !== "clear" && <span className="tooltip-flag">{LEDGER_STATUS[m.status]}</span>}
    </div>
  );
}

function PlanHistory({ plan, onOpenRun }) {
  const data = plan.months.map((m) => ({ ...m, label: shortPeriodLabel(m.year, m.month) }));
  const animate = !prefersReducedMotion();
  return (
    <section className="detail-plan">
      <div className="heading-row">
        <h3>{planLabel(plan.metric)}</h3>
        <span className={plan.open ? "balance-open" : "balance-settled"}>
          {plan.open ? `Open balance ${formatSignedMoney(plan.balance)}` : "Settled"}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e8eef7" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatCompactMoney} tick={{ fontSize: 12 }} width={56} />
          <ReferenceLine y={0} stroke="#64748b" />
          <Tooltip content={<HistoryTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="difference" name="Difference that month" maxBarSize={28} isAnimationActive={animate}>
            {data.map((m) => (
              <Cell key={`${m.year}-${m.month}`} fill={`rgb(${(m.difference < 0 ? DIRECTION.negative : DIRECTION.positive).color})`} />
            ))}
          </Bar>
          <Line
            dataKey="balance"
            name="Running balance"
            type="stepAfter"
            stroke="#172033"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={animate}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="table-scroll detail-scroll">
        <table className="mismatch-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Payroll</th>
              <th className="num">Invoice</th>
              <th className="num">Difference</th>
              <th className="num">Balance</th>
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {[...plan.months].reverse().map((m) => (
              <tr key={`${m.year}-${m.month}`}>
                <td>
                  <button type="button" className="employee-link" onClick={() => onOpenRun(m.run_id)}>
                    {monthName(m.month)} {m.year}
                  </button>
                </td>
                <td className="num">{formatMoney(m.payroll)}</td>
                <td className="num">{formatMoney(m.invoice)}</td>
                <td className="num difference">{m.difference ? formatSignedMoney(m.difference) : "·"}</td>
                <td className="num">{formatSignedMoney(m.balance)}</td>
                <td>{m.status !== "clear" && <span className={`ledger-badge ledger-${m.status}`}>{LEDGER_STATUS[m.status]}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// A panel over the dashboard with one employee's month-by-month history for each plan.
function EmployeeDetail({ eecode, onClose, onOpenRun }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setError("");
    api
      .employeeHistory(eecode)
      .then((data) => !cancelled && setHistory(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [eecode]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openPlans = (history?.plans ?? []).filter((p) => p.open);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-header">
          <div>
            <h2 id="employee-detail-title">{history?.name ?? "Employee"}</h2>
            <p className="employee-code">
              {eecode}
              {history && (openPlans.length
                ? `, open balance in ${openPlans.length} ${openPlans.length === 1 ? "plan" : "plans"}`
                : ", all plans settled")}
            </p>
          </div>
          <button type="button" ref={closeRef} onClick={onClose}>Close</button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {!history && !error && <p className="empty-state">Loading...</p>}
        {history?.plans.map((plan) => (
          <PlanHistory key={plan.metric} plan={plan} onOpenRun={(runId) => onOpenRun(runId, eecode)} />
        ))}
      </div>
    </div>
  );
}

export default EmployeeDetail;
