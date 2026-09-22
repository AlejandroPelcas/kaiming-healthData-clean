import { useCallback, useEffect, useMemo, useState } from "react";
import FileDrop from "./DragAndDrop";
import YearInput from "./YearInput";
import PlanPicker from "./PlanPicker";
import InsightsPanel from "./InsightsPanel";
import MisMatchTable from "./MisMatchTable";
import VarianceChart from "./VarianceChart";
import TrendsPanel from "./TrendsPanel";
import AskPanel from "./AskPanel";
import { api } from "./api";
import {
  MONTHS,
  PLAN_BY_CODE,
  formatRunTime,
  padMonth,
  periodIndex,
  periodLabel,
  planLabel,
  prefersReducedMotion,
} from "./dashboard";
import "./App.css";

function App() {
  // Period. Month stays a two-digit string ("03") because the invoice sheet is named "2026 03".
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");

  // Step 1: Paycom payroll for the month
  const [payroll, setPayroll] = useState(null);
  const [paycom1, setPaycom1] = useState(null);
  const [paycom2, setPaycom2] = useState(null);
  const [replacingPayroll, setReplacingPayroll] = useState(false);
  const [savingPayroll, setSavingPayroll] = useState(false);

  // Step 2: invoice comparison
  const [planCode, setPlanCode] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [comparing, setComparing] = useState(false);

  // Results
  const [runs, setRuns] = useState([]);
  const [offenders, setOffenders] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [rows, setRows] = useState([]);
  const [selectedEecode, setSelectedEecode] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const monthNumber = Number(month);
  const periodReady = /^\d{4}$/.test(String(year)) && monthNumber >= 1 && monthNumber <= 12;

  const loadHistory = useCallback(async () => {
    try {
      const [allRuns, repeat] = await Promise.all([api.runs(), api.repeatOffenders()]);
      setRuns(allRuns);
      setOffenders(repeat);
    } catch (err) {
      setError(`Couldn't load saved results. ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Check whether this month's Paycom payroll is already saved.
  useEffect(() => {
    setPaycom1(null);
    setPaycom2(null);
    setReplacingPayroll(false);
    if (!periodReady) {
      setPayroll(null);
      return undefined;
    }
    let cancelled = false;
    api
      .payrollStatus(year, month)
      .then((status) => !cancelled && setPayroll(status))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [year, month, periodReady]);

  // Plans already compared for the selected month, keyed by plan code.
  const monthRuns = useMemo(
    () =>
      Object.fromEntries(
        runs
          .filter((run) => run.year === Number(year) && run.month === monthNumber)
          .map((run) => [run.metric, run])
      ),
    [runs, year, monthNumber]
  );

  // The same plan's most recent earlier month, for "vs last month" changes.
  const previousRun = useMemo(() => {
    if (!activeRun) return null;
    const current = periodIndex(activeRun.year, activeRun.month);
    return (
      runs
        .filter((run) => run.metric === activeRun.metric && periodIndex(run.year, run.month) < current)
        .sort((a, b) => periodIndex(b.year, b.month) - periodIndex(a.year, a.month))[0] ?? null
    );
  }, [activeRun, runs]);

  const clearMessages = () => {
    setError("");
    setNotice("");
  };

  const scrollToResults = () => {
    requestAnimationFrame(() =>
      document.getElementById("results")?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      })
    );
  };

  const showRun = (data) => {
    setActiveRun(data.run);
    setRows(data.rows);
    setSelectedEecode(null);
    setTypeFilter("all");
  };

  const savePayroll = async () => {
    clearMessages();
    if (!periodReady) return setError("Choose the year and month first.");
    if (!paycom1 || !paycom2) return setError("Add both Paycom check registers.");

    setSavingPayroll(true);
    try {
      const status = await api.uploadPayroll(year, month, paycom1, paycom2);
      const hadRuns = Object.keys(monthRuns).length > 0;
      setPayroll({ ...status, uploaded: true });
      setPaycom1(null);
      setPaycom2(null);
      setReplacingPayroll(false);
      setNotice(
        `Saved Paycom payroll for ${periodLabel(year, monthNumber)}.` +
          (hadRuns ? " Compare this month's invoices again so they use the new payroll." : "")
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPayroll(false);
    }
  };

  const compareInvoice = async () => {
    clearMessages();
    if (!payroll?.uploaded) return setError(`Save the Paycom payroll for ${periodLabel(year, monthNumber)} first.`);
    if (!planCode) return setError("Choose which plan this invoice is for.");
    if (!invoice) return setError("Add the provider invoice.");

    setComparing(true);
    try {
      const data = await api.compare(year, month, PLAN_BY_CODE[planCode], invoice);
      showRun(data);
      setInvoice(null);
      await loadHistory();
      scrollToResults();
    } catch (err) {
      setError(err.message);
    } finally {
      setComparing(false);
    }
  };

  const openRun = async (runId) => {
    clearMessages();
    try {
      const data = await api.run(runId);
      showRun(data);
      setYear(String(data.run.year));
      setMonth(padMonth(data.run.month));
      setPlanCode(data.run.metric);
      scrollToResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Picking a bar in the chart selects the row, clearing a type filter that would hide it.
  const selectEmployee = (eecode) => {
    setSelectedEecode((current) => (current === eecode ? null : eecode));
    const row = rows.find((r) => r.eecode === eecode);
    if (row && typeFilter !== "all" && row.mismatch_type !== typeFilter) setTypeFilter("all");
  };

  const cancelReplace = () => {
    setReplacingPayroll(false);
    setPaycom1(null);
    setPaycom2(null);
  };

  const showPayrollUpload = periodReady && (!payroll?.uploaded || replacingPayroll);

  return (
    <main className="container">
      <section className="app-header">
        <img src="/kai-ming-logo.jpeg" alt="Kai Ming Logo" className="logo" />
        <div>
          <p className="eyebrow">Benefits Reconciliation</p>
          <h1>Kai Ming Benefits Reconciliation</h1>
          <p>
            Upload Paycom payroll reports and provider invoices to compare
            employee benefit deductions.
          </p>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status">
          {notice}
        </div>
      )}

      <div className="setup-grid">
        <section className="section-card">
          <h2>
            <span className="step">1</span>Month and Paycom payroll
          </h2>

          <div className="period-row">
            <YearInput year={year} setYear={setYear} />
            <label className="field">
              <span>Month</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Choose a month</option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={padMonth(i + 1)}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!periodReady && <p className="helper-text">Choose a year and month to start.</p>}

          {periodReady && payroll?.uploaded && !replacingPayroll && (
            <div className="payroll-status">
              <p>
                <strong>Payroll saved for {periodLabel(year, monthNumber)}</strong>
                <br />
                {payroll.employees} employees from {payroll.paycom1_file} and {payroll.paycom2_file}
              </p>
              <button type="button" onClick={() => setReplacingPayroll(true)}>
                Replace files
              </button>
            </div>
          )}

          {showPayrollUpload && (
            <>
              <FileDrop label="Paycom check register: days 1–15" onFileSelect={setPaycom1} file={paycom1} />
              {paycom1 && <p className="file-name">{paycom1.name}</p>}

              <FileDrop label="Paycom check register: days 16–31" onFileSelect={setPaycom2} file={paycom2} />
              {paycom2 && <p className="file-name">{paycom2.name}</p>}

              <div className="card-actions">
                {replacingPayroll && (
                  <button type="button" onClick={cancelReplace}>
                    Cancel
                  </button>
                )}
                <button type="button" className="compare-button" onClick={savePayroll} disabled={savingPayroll}>
                  {savingPayroll ? "Saving..." : "Save payroll"}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="section-card">
          <h2>
            <span className="step">2</span>Compare an invoice
          </h2>

          <PlanPicker planCode={planCode} onChange={setPlanCode} monthRuns={monthRuns} />
          <p className="helper-text picker-help">
            Plans already compared this month show how many employees had a difference, or ✓
            if everything matched.
          </p>

          <FileDrop label="Provider invoice" onFileSelect={setInvoice} file={invoice} />
          {invoice && <p className="file-name">{invoice.name}</p>}

          <div className="card-actions">
            <button
              type="button"
              className="compare-button"
              onClick={compareInvoice}
              disabled={comparing || !payroll?.uploaded}
            >
              {comparing ? "Comparing..." : "Compare invoice"}
            </button>
          </div>
          {periodReady && !payroll?.uploaded && (
            <p className="helper-text">Save this month's Paycom payroll first.</p>
          )}
        </section>
      </div>

      {activeRun ? (
        <div id="results">
          <div className="results-heading">
            <h2>
              {planLabel(activeRun.metric)}, {periodLabel(activeRun.year, activeRun.month)}
            </h2>
            <p>
              {activeRun.invoice_file}, compared {formatRunTime(activeRun.run_at)}
            </p>
          </div>

          <InsightsPanel
            run={activeRun}
            previousRun={previousRun}
            topRow={rows[0]}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
          />

          <div className="results-grid">
            <section className="section-card">
              <h2>Employees with a difference</h2>
              <MisMatchTable
                rows={rows}
                run={activeRun}
                selectedEecode={selectedEecode}
                onSelect={selectEmployee}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
              />
            </section>
            <section className="section-card">
              <h2>Largest differences</h2>
              <VarianceChart rows={rows} selectedEecode={selectedEecode} onSelect={selectEmployee} />
            </section>
          </div>

          <AskPanel run={activeRun} rows={rows} />
        </div>
      ) : (
        runs.length > 0 && (
          <section className="section-card">
            <p className="empty-state">
              Compare an invoice above, or select a month in the history below to open a past
              comparison.
            </p>
          </section>
        )
      )}

      {runs.length > 0 && (
        <TrendsPanel runs={runs} activeRun={activeRun} offenders={offenders} onOpenRun={openRun} />
      )}
    </main>
  );
}

export default App;