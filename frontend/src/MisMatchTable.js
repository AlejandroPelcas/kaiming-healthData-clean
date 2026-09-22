import { useEffect, useMemo, useRef, useState } from "react";
import {
  MISMATCH_TYPES,
  formatMoney,
  formatSignedMoney,
  padMonth,
  planLabel,
  prefersReducedMotion,
} from "./dashboard";

const COLUMNS = [
  { key: "name", label: "Employee" },
  { key: "type", label: "Type", sortable: false },
  { key: "payroll", label: "Payroll", numeric: true },
  { key: "invoice", label: "Invoice", numeric: true },
  { key: "difference", label: "Difference", numeric: true },
];

function csvCell(value) {
  let text = String(value ?? "");
  // Stop spreadsheet apps from treating text like "=SUM(...)" as a formula.
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows, run) {
  const header = [
    "Employee code", "Name", "Type", "Payroll", "Days 1-15", "Days 16-31",
    "Invoice", "Difference", "Matches one paycheck",
  ];
  const lines = rows.map((row) => [
    row.eecode,
    row.name ?? "",
    MISMATCH_TYPES[row.mismatch_type]?.label ?? row.mismatch_type,
    row.payroll,
    row.payroll_p1,
    row.payroll_p2,
    row.invoice ?? "",
    row.difference,
    row.one_paycheck ? "Yes" : "",
  ]);
  const csv = [header, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${planLabel(run.metric).replace(/\s+/g, "-")}-${run.year}-${padMonth(run.month)}-differences.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MisMatchTable({ rows, run, selectedEecode, onSelect, typeFilter, onTypeFilter }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "difference", dir: "desc" });
  const rowRefs = useRef({});

  const counts = useMemo(() => {
    const result = {};
    rows.forEach((row) => {
      result[row.mismatch_type] = (result[row.mismatch_type] ?? 0) + 1;
    });
    return result;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (typeFilter === "all" || row.mismatch_type === typeFilter) &&
        (!term ||
          (row.name ?? "").toLowerCase().includes(term) ||
          String(row.eecode).toLowerCase().includes(term))
    );

    // "Difference" sorts by size, so the biggest problems come first either way.
    const valueOf = (row) => {
      if (sort.key === "name") return (row.name ?? row.eecode).toLowerCase();
      if (sort.key === "difference") return Math.abs(row.difference);
      return row[sort.key] ?? 0;
    };
    const sorted = [...filtered].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, search, typeFilter, sort]);

  // Bring the row into view when it's picked from the chart.
  useEffect(() => {
    if (!selectedEecode) return;
    rowRefs.current[selectedEecode]?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [selectedEecode]);

  const toggleSort = (key) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );

  if (rows.length === 0) {
    return (
      <p className="empty-state">
        Every employee matched. Payroll and the invoice agree within $0.05.
      </p>
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <input
          type="search"
          className="table-search"
          placeholder="Search name or employee code"
          aria-label="Search employees"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => downloadCsv(visibleRows, run)}
          disabled={visibleRows.length === 0}
        >
          Download CSV
        </button>
      </div>

      <div className="filter-chips" role="group" aria-label="Filter by type">
        <button
          type="button"
          className={`chip ${typeFilter === "all" ? "selected" : ""}`}
          onClick={() => onTypeFilter("all")}
          aria-pressed={typeFilter === "all"}
        >
          All <span>{rows.length}</span>
        </button>
        {Object.entries(MISMATCH_TYPES).map(([key, info]) => (
          <button
            key={key}
            type="button"
            className={`chip ${typeFilter === key ? "selected" : ""}`}
            onClick={() => onTypeFilter(key)}
            disabled={!counts[key]}
            title={info.hint}
            aria-pressed={typeFilter === key}
          >
            {info.label} <span>{counts[key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="table-scroll">
        <table className="mismatch-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.numeric ? "num" : ""}
                  aria-sort={
                    sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  {col.sortable === false ? (
                    col.label
                  ) : (
                    <button type="button" className="sort-button" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sort.key === col.key && (sort.dir === "asc" ? " ▲" : " ▼")}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.eecode}
                ref={(el) => {
                  rowRefs.current[row.eecode] = el;
                }}
                className={row.eecode === selectedEecode ? "selected-row" : ""}
                onClick={() => onSelect(row.eecode)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(row.eecode);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <div className="employee-name">{row.name ?? "Name not found"}</div>
                  <div className="employee-code">{row.eecode}</div>
                </td>
                <td>
                  <span className={`type-badge type-${row.mismatch_type}`}>
                    {MISMATCH_TYPES[row.mismatch_type]?.label ?? row.mismatch_type}
                  </span>
                  {row.one_paycheck && (
                    <span
                      className="flag-badge"
                      title="The difference equals one paycheck's deduction: likely missed or doubled on one check register."
                    >
                      One paycheck?
                    </span>
                  )}
                </td>
                <td className="num">
                  {formatMoney(row.payroll)}
                  {row.payroll !== 0 && (
                    <div className="split" title="Days 1–15 + days 16–31">
                      {formatMoney(row.payroll_p1)} + {formatMoney(row.payroll_p2)}
                    </div>
                  )}
                </td>
                <td className="num">{formatMoney(row.invoice)}</td>
                <td className="num difference">{formatSignedMoney(row.difference)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleRows.length === 0 && (
          <p className="empty-state">No employees match this search or filter.</p>
        )}
      </div>
      <p className="helper-text table-footnote">
        Showing {visibleRows.length} of {rows.length}. Differences under $0.05 are ignored.
        Difference is payroll minus invoice.
      </p>
    </div>
  );
}

export default MisMatchTable;
