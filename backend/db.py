"""
SQLite storage for monthly payroll and reconciliation results.

This database holds employee names and deduction amounts. It lives in data/
by default, which .gitignore keeps out of version control. Set RECON_DB_PATH
to store it somewhere else.
"""
import os
import sqlite3
from contextlib import contextmanager

import numpy as np
import pandas as pd

DB_PATH = os.environ.get("RECON_DB_PATH", os.path.join("data", "reconciliation.db"))

SCHEMA = """
-- One row per month: which Paycom files were uploaded and when.
CREATE TABLE IF NOT EXISTS payroll_uploads (
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL,
    paycom1_file  TEXT,
    paycom2_file  TEXT,
    employees     INTEGER NOT NULL,
    uploaded_at   TEXT NOT NULL,
    PRIMARY KEY (year, month)
);

-- Combined Paycom deductions, one row per employee per deduction code.
-- amount_p1 = days 1-15 register, amount_p2 = days 16-31 register.
CREATE TABLE IF NOT EXISTS payroll (
    year       INTEGER NOT NULL,
    month      INTEGER NOT NULL,
    eecode     TEXT NOT NULL,
    eename     TEXT,
    code       TEXT NOT NULL,
    amount_p1  REAL NOT NULL DEFAULT 0,
    amount_p2  REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (year, month, eecode, code)
);

-- One row per comparison (month + provider + payroll code). Re-running replaces it.
CREATE TABLE IF NOT EXISTS runs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    year               INTEGER NOT NULL,
    month              INTEGER NOT NULL,
    provider           TEXT NOT NULL,
    metric             TEXT NOT NULL,
    invoice_file       TEXT,
    run_at             TEXT NOT NULL,
    employees_compared INTEGER NOT NULL,
    mismatch_count     INTEGER NOT NULL,
    payroll_total      REAL NOT NULL,
    invoice_total      REAL NOT NULL,
    net_variance       REAL NOT NULL,
    gross_variance     REAL NOT NULL,
    UNIQUE (year, month, provider, metric)
);

-- Every employee in a comparison, matched or not.
CREATE TABLE IF NOT EXISTS comparison_rows (
    run_id        INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    eecode        TEXT NOT NULL,
    name          TEXT,
    payroll       REAL NOT NULL,
    payroll_p1    REAL NOT NULL,
    payroll_p2    REAL NOT NULL,
    invoice       REAL,
    difference    REAL NOT NULL,
    mismatch_type TEXT NOT NULL,
    one_paycheck  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, eecode)
);

CREATE INDEX IF NOT EXISTS idx_rows_eecode ON comparison_rows (eecode);
"""

RUN_FIELDS = [
    "year", "month", "provider", "metric",
    "invoice_file", "run_at", "employees_compared", "mismatch_count",
    "payroll_total", "invoice_total", "net_variance", "gross_variance",
]

ROW_FIELDS = [
    "eecode", "name", "payroll", "payroll_p1", "payroll_p2",
    "invoice", "difference", "mismatch_type", "one_paycheck",
]

# Run summaries plus per-type counts, computed from the stored rows.
RUN_SUMMARY_SQL = """
SELECT r.*,
    COALESCE(SUM(c.mismatch_type = 'amount_diff'), 0)  AS amount_diff_count,
    COALESCE(SUM(c.mismatch_type = 'payroll_only'), 0) AS payroll_only_count,
    COALESCE(SUM(c.mismatch_type = 'invoice_only'), 0) AS invoice_only_count,
    COALESCE(SUM(c.one_paycheck), 0)                   AS one_paycheck_count,
    COALESCE(MAX(ABS(c.difference)), 0)                AS largest_variance
FROM runs r
LEFT JOIN comparison_rows c ON c.run_id = r.id
"""


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

@contextmanager
def connect():
    """Open a connection that commits on success and rolls back on error."""
    folder = os.path.dirname(DB_PATH)
    if folder:
        os.makedirs(folder, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)


def _sql_value(value):
    """Convert pandas/numpy values into types sqlite3 can store."""
    if value is None:
        return None
    if not isinstance(value, str) and pd.isna(value):
        return None
    if isinstance(value, (bool, np.bool_)):
        return int(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    return value


def _where(filters):
    """Build a WHERE clause from {column: value}, skipping empty values."""
    clauses, params = [], []
    for column, value in filters.items():
        if value is not None and value != "":
            clauses.append(f"{column} = ?")
            params.append(value)
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------

def save_payroll(year, month, payroll, paycom1_file=None, paycom2_file=None):
    """Store (or replace) a month's combined Paycom data."""
    columns = ["eecode", "eename", "code", "amount_p1", "amount_p2"]
    rows = [
        (year, month, *[_sql_value(v) for v in row])
        for row in payroll[columns].itertuples(index=False)
    ]
    with connect() as conn:
        conn.execute("DELETE FROM payroll WHERE year = ? AND month = ?", (year, month))
        conn.executemany(
            "INSERT INTO payroll (year, month, eecode, eename, code, amount_p1, amount_p2) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.execute(
            """
            INSERT INTO payroll_uploads (year, month, paycom1_file, paycom2_file, employees, uploaded_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (year, month) DO UPDATE SET
                paycom1_file = excluded.paycom1_file,
                paycom2_file = excluded.paycom2_file,
                employees    = excluded.employees,
                uploaded_at  = excluded.uploaded_at
            """,
            (year, month, paycom1_file, paycom2_file, int(payroll["eecode"].nunique())),
        )


def get_payroll_upload(year, month):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM payroll_uploads WHERE year = ? AND month = ?", (year, month)
        ).fetchone()
    return dict(row) if row else None


def load_payroll(year, month, code):
    """One deduction code's payroll for a month: eecode, eename, amount_p1, amount_p2."""
    with connect() as conn:
        return pd.read_sql_query(
            "SELECT eecode, eename, amount_p1, amount_p2 FROM payroll "
            "WHERE year = ? AND month = ? AND code = ?",
            conn,
            params=(year, month, code),
        )


# ---------------------------------------------------------------------------
# Comparison runs
# ---------------------------------------------------------------------------

def save_run(summary, rows):
    """Store (or replace) a comparison and all its rows. Returns the run id."""
    placeholders = ", ".join("?" * len(RUN_FIELDS))
    # The first four fields identify the run; everything else is refreshed on re-run.
    updates = ", ".join(f"{f} = excluded.{f}" for f in RUN_FIELDS[4:])
    row_placeholders = ", ".join("?" * len(ROW_FIELDS))

    with connect() as conn:
        conn.execute(
            f"INSERT INTO runs ({', '.join(RUN_FIELDS)}) VALUES ({placeholders}) "
            f"ON CONFLICT (year, month, provider, metric) DO UPDATE SET {updates}",
            [_sql_value(summary[f]) for f in RUN_FIELDS],
        )
        run_id = conn.execute(
            "SELECT id FROM runs WHERE year = ? AND month = ? AND provider = ? AND metric = ?",
            (summary["year"], summary["month"], summary["provider"], summary["metric"]),
        ).fetchone()["id"]

        conn.execute("DELETE FROM comparison_rows WHERE run_id = ?", (run_id,))
        conn.executemany(
            f"INSERT INTO comparison_rows (run_id, {', '.join(ROW_FIELDS)}) "
            f"VALUES (?, {row_placeholders})",
            [
                (run_id, *[_sql_value(v) for v in row])
                for row in rows[ROW_FIELDS].itertuples(index=False)
            ],
        )
    return run_id


def list_runs(run_id=None, year=None, month=None, provider=None, metric=None):
    """Run summaries (with mismatch-type counts), oldest first."""
    where, params = _where({
        "r.id": run_id, "r.year": year, "r.month": month,
        "r.provider": provider, "r.metric": metric,
    })
    sql = RUN_SUMMARY_SQL + where + " GROUP BY r.id ORDER BY r.year, r.month, r.provider, r.metric"
    with connect() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def get_run(run_id):
    runs = list_runs(run_id=run_id)
    return runs[0] if runs else None


def get_run_rows(run_id, mismatches_only=True):
    """A run's rows, largest absolute difference first."""
    sql = f"SELECT {', '.join(ROW_FIELDS)} FROM comparison_rows WHERE run_id = ?"
    if mismatches_only:
        sql += " AND mismatch_type != 'match'"
    sql += " ORDER BY ABS(difference) DESC, name"
    with connect() as conn:
        rows = [dict(row) for row in conn.execute(sql, (run_id,)).fetchall()]
    for row in rows:
        row["one_paycheck"] = bool(row["one_paycheck"])
    return rows


def load_mismatch_history(provider=None, metric=None):
    """Every mismatched row across all months, joined with its run's period."""
    where, params = _where({"r.provider": provider, "r.metric": metric})
    where = (where + " AND" if where else " WHERE") + " c.mismatch_type != 'match'"
    sql = (
        "SELECT r.year, r.month, r.provider, r.metric, "
        "c.eecode, c.name, c.difference, c.mismatch_type "
        "FROM comparison_rows c JOIN runs r ON r.id = c.run_id" + where
    )
    with connect() as conn:
        return pd.read_sql_query(sql, conn, params=params)


# ---------------------------------------------------------------------------
# Running balances (see ledger.py)
# ---------------------------------------------------------------------------

def load_run_periods(metric=None):
    """Every comparison that has been run: id, year, month, provider, metric."""
    where, params = _where({"metric": metric})
    with connect() as conn:
        return pd.read_sql_query("SELECT id, year, month, provider, metric FROM runs" + where, conn, params=params)


def load_ledger_rows(metric=None, eecode=None):
    """Every saved comparison row (matched ones too) with its run's plan and month."""
    where, params = _where({"r.metric": metric, "c.eecode": eecode})
    sql = (
        "SELECT r.id AS run_id, r.year, r.month, r.metric, "
        "c.eecode, c.name, c.payroll, c.invoice, c.difference "
        "FROM comparison_rows c JOIN runs r ON r.id = c.run_id" + where
    )
    with connect() as conn:
        return pd.read_sql_query(sql, conn, params=params)