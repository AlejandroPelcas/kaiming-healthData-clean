"""
Running balances: each employee's signed differences added up month by month, per plan.

Difference is payroll minus invoice, so a -$20 shortfall for four months followed by a
+$80 catch-up in Paycom brings the balance back to $0. Everything here is calculated
from comparisons already saved in the database; nothing extra is stored.
"""
import numpy as np
import pandas as pd

import db

SETTLED_TOLERANCE = 1.00  # a balance within $1 of zero counts as settled
CELL_TOLERANCE = 0.05     # monthly differences smaller than this count as 0 (same as matching)

STATUSES = {
    "new": "New difference",
    "growing": "Still growing",
    "open": "Still open",
    "partial_catch_up": "Partial catch-up",
    "settled": "Catch-up, settled",
    "over_corrected": "Over-corrected",
    "clear": "No balance",
}
# When several plans are combined, show the most noteworthy status.
STATUS_PRIORITY = ["over_corrected", "settled", "partial_catch_up", "new", "growing", "open", "clear"]

CELL_COLUMNS = ["metric", "eecode", "name", "run_id", "year", "month", "period",
                "payroll", "invoice", "difference", "counted", "balance_before", "balance", "status"]


def _period(year, month):
    return year * 12 + month - 1


def _num(value):
    return None if value is None or pd.isna(value) else round(float(value), 2)


def _text(value):
    """Names can be missing; pandas gives NaN, which isn't valid JSON."""
    return None if value is None or (not isinstance(value, str) and pd.isna(value)) else str(value)


def build(metric=None, eecode=None):
    """
    One row per plan, employee and compared month. Every employee who ever appears in
    a plan gets a row for each month that plan was compared; a month where they were on
    neither side counts as $0. Months a plan wasn't compared have no row at all.
    """
    runs = db.load_run_periods(metric)
    rows = db.load_ledger_rows(metric, eecode)
    if runs.empty or rows.empty:
        return pd.DataFrame(columns=CELL_COLUMNS)

    runs = runs.rename(columns={"id": "run_id"})
    runs["period"] = _period(runs["year"], runs["month"])
    rows["period"] = _period(rows["year"], rows["month"])

    employees = rows[["metric", "eecode"]].drop_duplicates()
    cells = employees.merge(runs[["metric", "run_id", "year", "month", "period"]], on="metric")
    cells = cells.merge(
        rows[["run_id", "eecode", "payroll", "invoice", "difference"]], on=["run_id", "eecode"], how="left"
    )

    cells["difference"] = cells["difference"].fillna(0.0)
    cells["counted"] = cells["difference"].where(cells["difference"].abs() >= CELL_TOLERANCE, 0.0)
    cells = cells.sort_values(["metric", "eecode", "period"]).reset_index(drop=True)
    cells["balance"] = cells.groupby(["metric", "eecode"])["counted"].cumsum().round(2)
    cells["balance_before"] = (cells["balance"] - cells["counted"]).round(2)
    cells["status"] = _status(cells["balance_before"], cells["counted"], cells["balance"])

    names = rows.dropna(subset=["name"]).sort_values("period").groupby("eecode")["name"].last()
    cells["name"] = cells["eecode"].map(names)
    return cells[CELL_COLUMNS]


def _status(before, change, after):
    open_before = before.abs() > SETTLED_TOLERANCE
    open_after = after.abs() > SETTLED_TOLERANCE
    changed = change != 0
    toward_zero = np.sign(change) != np.sign(before)
    same_side = np.sign(after) == np.sign(before)
    return np.select(
        [
            ~changed & open_after,                                   # nothing new, still owed
            ~changed | (~open_before & ~open_after),                 # nothing (or only cents) to track
            ~open_before & open_after,                               # balance just appeared
            open_before & ~toward_zero,                              # more in the same direction
            open_before & toward_zero & ~open_after,                 # catch-up closed it
            open_before & toward_zero & same_side,                   # catch-up, some still owed
        ],
        ["open", "clear", "new", "growing", "settled", "partial_catch_up"],
        default="over_corrected",                                    # catch-up went past zero
    )


def _open(balance):
    return balance.abs() > SETTLED_TOLERANCE


# ---------------------------------------------------------------------------
# Summaries for the dashboard
# ---------------------------------------------------------------------------

def plan_month_summary(cells=None):
    """Per plan and month: outstanding balance, net and gross differences, counts."""
    cells = build() if cells is None else cells
    if cells.empty:
        return []
    cells = cells.assign(
        open_amount=cells["balance"].abs().where(_open(cells["balance"]), 0.0),
        is_open=_open(cells["balance"]),
        abs_counted=cells["counted"].abs(),
        is_settled=cells["status"] == "settled",
    )
    summary = cells.groupby(["metric", "year", "month"], as_index=False).agg(
        outstanding=("open_amount", "sum"),
        net=("counted", "sum"),
        gross=("abs_counted", "sum"),
        open_count=("is_open", "sum"),
        settled_count=("is_settled", "sum"),
    )
    return [
        {"metric": r.metric, "year": int(r.year), "month": int(r.month),
         "outstanding": _num(r.outstanding), "net": _num(r.net), "gross": _num(r.gross),
         "open_count": int(r.open_count), "settled_count": int(r.settled_count)}
        for r in summary.itertuples(index=False)
    ]


def open_balances(cells=None):
    """Employees whose balance is still open as of each plan's latest compared month."""
    cells = build() if cells is None else cells
    if cells.empty:
        return []
    latest = cells.groupby("metric")["period"].transform("max")
    current = cells[(cells["period"] == latest) & _open(cells["balance"])]

    # A balance is "open since" the last month it went from settled to owed.
    starts = cells[~_open(cells["balance_before"]) & _open(cells["balance"])]
    open_since = starts.groupby(["metric", "eecode"])["period"].max()

    result = []
    for r in current.itertuples(index=False):
        since = open_since.get((r.metric, r.eecode))
        result.append({
            "metric": r.metric, "eecode": str(r.eecode), "name": _text(r.name),
            "balance": _num(r.balance),
            "open_since": None if since is None else {"year": int(since // 12), "month": int(since % 12) + 1},
            "months_open": None if since is None else int(r.period - since + 1),
            "latest_difference": _num(r.counted),
            "status": r.status,
        })
    return sorted(result, key=lambda x: -abs(x["balance"]))


def run_ledger(run_id, metric, year, month):
    """Each employee's balance after this run, plus totals for the run's headline numbers."""
    cells = build(metric)
    if cells.empty:
        return {}, {"outstanding": 0.0, "open_count": 0, "settled_count": 0}
    here = cells[cells["run_id"] == run_id]
    by_employee = {
        r.eecode: {"balance": _num(r.balance), "ledger_status": r.status}
        for r in here.itertuples(index=False)
    }
    totals = {
        "outstanding": _num(here["balance"].abs().where(_open(here["balance"]), 0.0).sum()),
        "open_count": int(_open(here["balance"]).sum()),
        "settled_count": int((here["status"] == "settled").sum()),
    }
    return by_employee, totals


# ---------------------------------------------------------------------------
# Employee views
# ---------------------------------------------------------------------------

def employee_grid(metric="all", months=12):
    """
    Employees down the side, months across the top. For one plan, each cell is that
    month's difference and running balance. For "all", plans are added together per month.
    Lists employees with a difference in the window or a balance still open.
    """
    cells = build(None if metric == "all" else metric)
    if cells.empty:
        return {"metric": metric, "months": [], "employees": []}

    periods = sorted(cells["period"].unique())[-months:]
    month_list = [{"period": int(p), "year": int(p // 12), "month": int(p % 12) + 1} for p in periods]
    position = {p: i for i, p in enumerate(periods)}

    # Final balance per plan and employee (as of each plan's latest month).
    finals = cells.sort_values("period").groupby(["metric", "eecode"]).tail(1)
    window = cells[cells["period"].isin(periods)]

    employees = []
    for eecode, mine in window.groupby("eecode"):
        my_finals = finals[finals["eecode"] == eecode]
        open_plans = [
            {"metric": r.metric, "balance": _num(r.balance)}
            for r in my_finals.itertuples(index=False) if abs(r.balance) > SETTLED_TOLERANCE
        ]
        if not open_plans and not (mine["counted"] != 0).any():
            continue

        row_cells = [None] * len(periods)
        for period, group in mine.groupby("period"):
            status = min(group["status"], key=STATUS_PRIORITY.index)
            row_cells[position[period]] = {
                "difference": _num(group["counted"].sum()),
                "balance": _num(group["balance"].sum()) if metric != "all" else None,
                "status": status,
                "run_id": int(group["run_id"].iloc[0]) if metric != "all" else None,
                "by_plan": None if metric != "all" else [
                    {"metric": r.metric, "difference": _num(r.counted), "balance": _num(r.balance)}
                    for r in group.itertuples(index=False) if r.counted != 0 or abs(r.balance) > SETTLED_TOLERANCE
                ],
            }

        employees.append({
            "eecode": eecode,
            "name": _text(mine["name"].dropna().iloc[-1]) if mine["name"].notna().any() else None,
            "balance": _num(my_finals["balance"].sum()) if metric != "all" else None,
            "open_amount": _num(sum(abs(p["balance"]) for p in open_plans)),
            "open_plans": open_plans,
            "cells": row_cells,
        })

    employees.sort(key=lambda e: (-e["open_amount"], (e["name"] or "").lower()))
    return {"metric": metric, "months": month_list, "employees": employees}


def employee_history(eecode):
    """One employee's month-by-month history for every plan they appear in."""
    cells = build(eecode=str(eecode))
    if cells.empty:
        return None
    plans = []
    for metric, group in cells.groupby("metric"):
        group = group.sort_values("period")
        final = group.iloc[-1]
        plans.append({
            "metric": metric,
            "balance": _num(final["balance"]),
            "open": bool(abs(final["balance"]) > SETTLED_TOLERANCE),
            "months": [
                {"year": int(r.year), "month": int(r.month), "run_id": int(r.run_id),
                 "payroll": _num(r.payroll), "invoice": _num(r.invoice),
                 "difference": _num(r.counted), "balance": _num(r.balance), "status": r.status}
                for r in group.itertuples(index=False)
            ],
        })
    plans.sort(key=lambda p: (not p["open"], -abs(p["balance"])))
    name = cells["name"].dropna()
    return {"eecode": str(eecode), "name": _text(name.iloc[-1]) if len(name) else None, "plans": plans}