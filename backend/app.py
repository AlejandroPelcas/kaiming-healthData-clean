# @Author: Alejandro Pelcastre
"""
Flask backend for the Kai Ming benefits reconciliation tool.

Monthly workflow:
  1. POST /api/payroll   Upload the two Paycom check registers for a month (saved once).
  2. POST /api/compare   Upload one provider invoice; it's compared against that
                         month's saved payroll. Repeat for each provider.
  3. GET  /api/...       Read saved results for the dashboard.

POST /upload still accepts all three files at once so the current frontend keeps working.
"""
import json
import logging
import os
from datetime import datetime, timezone

import pandas as pd
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import db
from util import (
    NUMERIC_COLS,
    compare_payroll_to_invoice,
    find_repeat_offenders,
    paycom_by_period,
    summarize_comparison,
    transform_healthcare,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

# Ollama settings
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:latest")
MAX_CONTEXT_ROWS = 200  # keeps the prompt from blowing past the model's context window

# Only these origins may call the API from a browser. The database now holds
# employee data, so any website you visit shouldn't be able to read it from
# localhost:5000 (the old CORS(app) allowed exactly that).
FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173",
).split(",")

app = Flask(__name__, static_folder="frontend/build", static_url_path="")
CORS(app, origins=FRONTEND_ORIGINS)
db.init_db()


@app.before_request
def log_every_request():
    logger.info("REQUEST: %s %s", request.method, request.path)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class InputError(Exception):
    """A problem with what the user sent. Returned to the browser as a 400."""


@app.errorhandler(InputError)
def handle_input_error(err):
    return jsonify({"error": str(err)}), 400


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MONTH_ABBRS = ["jan", "feb", "mar", "apr", "may", "jun",
               "jul", "aug", "sep", "oct", "nov", "dec"]


def parse_period(year, month):
    """
    Turn the year and month the user picked into integers (month 1-12).
    Accepts month as 'January', 'Jan', '1' or '01'.
    """
    year, month = (year or "").strip(), (month or "").strip()
    if not year or not month:
        raise InputError("Please select the year and month first.")
    if not year.isdigit():
        raise InputError(f"{year!r} isn't a valid year.")
    if month.isdigit() and 1 <= int(month) <= 12:
        return int(year), int(month)
    if month[:3].lower() in MONTH_ABBRS:
        return int(year), MONTH_ABBRS.index(month[:3].lower()) + 1
    raise InputError(f"{month!r} isn't a recognizable month.")


def resolve_metric(provider, metric, unum_type):
    """The Paycom deduction code to compare, e.g. 'dvsn' or, for UNUM, 'devl'."""
    if not provider:
        raise InputError("Please select a health provider.")
    code = unum_type if provider == "unum" else metric
    if provider == "unum" and not code:
        raise InputError("Please select a UNUM type.")
    if code not in NUMERIC_COLS:
        raise InputError(f"Unknown payroll code {code!r} for provider {provider!r}.")
    return code


def now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def df_to_records(df):
    """DataFrame -> JSON-safe list of dicts (NaN becomes null, numpy types become Python)."""
    return json.loads(df.to_json(orient="records")) if not df.empty else []


def read_invoice_sheet(file, sheet_name):
    xls = pd.ExcelFile(file)
    if sheet_name not in xls.sheet_names:
        raise InputError(
            f"No sheet named '{sheet_name}' in {file.filename}. "
            f"Sheets found: {', '.join(xls.sheet_names)}"
        )
    return pd.read_excel(xls, sheet_name)


def save_payroll_files(year, month, paycom1, paycom2):
    payroll, missing = paycom_by_period(pd.read_excel(paycom1), pd.read_excel(paycom2))
    db.save_payroll(year, month, payroll, paycom1.filename, paycom2.filename)
    return {**db.get_payroll_upload(year, month), "missing_columns": missing}


def run_comparison(year, month, sheet_name, provider, metric_code, health_file):
    """Compare an invoice against the month's saved payroll, store it, return the run id."""
    if db.get_payroll_upload(year, month) is None:
        raise InputError(
            f"No Paycom data saved for {month}/{year} yet. "
            "Upload the Paycom check registers for this month first."
        )

    invoice_raw = read_invoice_sheet(health_file, sheet_name)
    try:
        invoice = transform_healthcare(invoice_raw, vendor=provider, unumType=metric_code)
    except (ValueError, KeyError, IndexError, AttributeError) as err:
        raise InputError(
            f"Couldn't read this file as a {provider} invoice ({err}). "
            "Check that the right provider is selected."
        ) from err

    rows = compare_payroll_to_invoice(db.load_payroll(year, month, metric_code), invoice)
    summary = summarize_comparison(rows)
    summary.update(
        year=year, month=month, provider=provider, metric=metric_code,
        invoice_file=health_file.filename, run_at=now_utc(),
    )
    return db.save_run(summary, rows)


def run_payload(run_id, include_all=False):
    return {
        "run": db.get_run(run_id),
        "rows": db.get_run_rows(run_id, mismatches_only=not include_all),
    }


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# Monthly workflow
# ---------------------------------------------------------------------------

@app.route("/api/payroll", methods=["GET"])
def payroll_status():
    """Whether Paycom data is already saved for a month: ?year=2026&month=3"""
    year, month = parse_period(request.args.get("year"), request.args.get("month"))
    upload = db.get_payroll_upload(year, month)
    return jsonify({"year": year, "month": month, "uploaded": upload is not None, **(upload or {})})


@app.route("/api/payroll", methods=["POST"])
def upload_payroll():
    """Save a month's Paycom registers. Form fields: year, month, paycom1, paycom2."""
    year, month = parse_period(request.form.get("year"), request.form.get("month"))
    paycom1 = request.files.get("paycom1")
    paycom2 = request.files.get("paycom2")
    if not paycom1 or not paycom2:
        raise InputError("Please upload both Paycom check registers.")
    return jsonify(save_payroll_files(year, month, paycom1, paycom2))


@app.route("/api/compare", methods=["POST"])
def compare():
    """
    Compare one invoice against saved payroll.
    Form fields: year, month, provider, metric, unumType, health.
    Returns {"run": summary, "rows": mismatched rows}.
    """
    year_raw, month_raw = request.form.get("year"), request.form.get("month")
    year, month = parse_period(year_raw, month_raw)
    provider = (request.form.get("provider") or "").lower()
    metric_code = resolve_metric(provider, request.form.get("metric"), request.form.get("unumType"))
    health = request.files.get("health")
    if not health:
        raise InputError("Please upload the provider invoice.")

    sheet_name = f"{year_raw.strip()} {month_raw.strip()}"
    run_id = run_comparison(year, month, sheet_name, provider, metric_code, health)
    return jsonify(run_payload(run_id))


@app.route("/upload", methods=["POST"])
def upload_files():
    """
    Legacy one-shot endpoint used by the current frontend: saves payroll and the
    comparison, then returns mismatches in the original shape
    (eecode, <payroll code>, Invoice, difference, Name).
    """
    year_raw, month_raw = request.form.get("year"), request.form.get("month")
    year, month = parse_period(year_raw, month_raw)
    provider = (request.form.get("provider") or "").lower()
    metric_code = resolve_metric(provider, request.form.get("metric"), request.form.get("unumType"))

    paycom1 = request.files.get("paycom1")
    paycom2 = request.files.get("paycom2")
    health = request.files.get("health")
    if not paycom1 or not paycom2 or not health:
        raise InputError("Missing file(s).")

    save_payroll_files(year, month, paycom1, paycom2)
    sheet_name = f"{year_raw.strip()} {month_raw.strip()}"
    run_id = run_comparison(year, month, sheet_name, provider, metric_code, health)

    return jsonify([
        {
            "eecode": row["eecode"],
            metric_code: row["payroll"],
            "Invoice": row["invoice"],
            "difference": row["difference"],
            "Name": row["name"],
        }
        for row in db.get_run_rows(run_id)
    ])


# ---------------------------------------------------------------------------
# Dashboard data
# ---------------------------------------------------------------------------

@app.route("/api/runs")
def list_runs():
    """
    Run summaries, oldest first. Optional filters: year, month, provider, metric.
    With no filters this is the full history for trend charts.
    """
    return jsonify(db.list_runs(
        year=request.args.get("year", type=int),
        month=request.args.get("month", type=int),
        provider=request.args.get("provider"),
        metric=request.args.get("metric"),
    ))


@app.route("/api/runs/<int:run_id>")
def run_detail(run_id):
    """One run's summary and rows. Add ?include=all to get matched rows too."""
    if db.get_run(run_id) is None:
        return jsonify({"error": "Run not found."}), 404
    return jsonify(run_payload(run_id, include_all=request.args.get("include") == "all"))


@app.route("/api/repeat-offenders")
def repeat_offenders():
    """
    Employees mismatched in consecutive months.
    Optional filters: provider, metric, min_months (default 2).
    """
    provider = request.args.get("provider")
    metric = request.args.get("metric")
    min_months = request.args.get("min_months", default=2, type=int)

    history = db.load_mismatch_history(provider=provider, metric=metric)
    runs = pd.DataFrame(db.list_runs(provider=provider, metric=metric))
    return jsonify(df_to_records(find_repeat_offenders(history, runs, min_streak=min_months)))


# ---------------------------------------------------------------------------
# Ask the local model
# ---------------------------------------------------------------------------

@app.route("/ask-ollama", methods=["POST"])
def ask_ollama():
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    context = body.get("context") or {}
    rows = context.get("mismatches") or []

    if not question:
        return jsonify({"error": "No question provided."}), 400
    if not rows:
        return jsonify({"error": "No comparison data yet. Run 'Compare Files' first."}), 400

    df = pd.DataFrame(rows)

    # Pre-compute totals in pandas, since LLMs are unreliable at arithmetic over many rows
    diff = (
        pd.to_numeric(df["difference"], errors="coerce")
        if "difference" in df.columns
        else pd.Series(dtype=float)
    )
    summary = (
        f"Total mismatched rows: {len(df)}\n"
        f"Sum of differences: {diff.sum():.2f}\n"
        f"Sum of absolute differences: {diff.abs().sum():.2f}\n"
        f"Largest absolute difference: {diff.abs().max():.2f}"
        if len(diff) else f"Total mismatched rows: {len(df)}"
    )

    # Send the biggest discrepancies first if we have to truncate
    if len(diff):
        df = df.loc[diff.abs().sort_values(ascending=False).index]
    csv_data = df.head(MAX_CONTEXT_ROWS).to_csv(index=False)
    truncated_note = (
        f"(Showing the {MAX_CONTEXT_ROWS} largest of {len(df)} rows.)\n"
        if len(df) > MAX_CONTEXT_ROWS else ""
    )

    system_prompt = (
        "You are an assistant inside a benefits reconciliation tool. Payroll deductions "
        "from Paycom are compared against a health provider's invoice. 'payroll' is what was "
        "deducted, 'Invoice' is what the provider billed, and 'difference' is the gap between them. "
        "Answer ONLY using the data provided. If the answer isn't in the data, say so. "
        "Never invent employees or numbers. Be concise."
    )
    user_prompt = (
        f"Period: {context.get('year')} {context.get('month')}\n"
        f"Provider: {context.get('provider')}  Metric: {context.get('metric')}\n\n"
        f"Summary:\n{summary}\n\n"
        f"{truncated_note}Data (CSV):\n{csv_data}\n\n"
        f"Question: {question}"
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
                # Ollama's default context window is small and silently truncates long prompts
                "options": {"temperature": 0.1, "num_ctx": 8192},
            },
            timeout=180,
        )
        resp.raise_for_status()
        answer = resp.json()["message"]["content"]
        return jsonify({"answer": answer})

    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Can't reach Ollama. Is it running (`ollama serve`)?"}), 503
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Ollama request failed: {e}"}), 502


if __name__ == "__main__":
    app.run(debug=True)