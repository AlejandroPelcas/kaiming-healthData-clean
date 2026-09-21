#@Author: Alejandro Pelcastre
import pandas as pd
import numpy as np
from util import transform_paycom, transform_healthcare, create_comparison_df, combine_paycom_data, create_name_map
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import io
import requests

### Ollama settings
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:9b")
MAX_CONTEXT_ROWS = 200  # keeps the prompt from blowing past the model's context window


UPLOAD_FOLDER = "uploads"   # ← MUST be defined first
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    static_folder="frontend/build",
    static_url_path=""
)

@app.before_request
def log_every_request():
    print(
        f"REQUEST: {request.method} {request.path}",
        flush=True
    )

print("LOADED APP.PY", __file__)

CORS(app) # allow all origins for simplicity
"""
Load the data in. Expect input to be in .xlsx format
Each Excel file has multiple sheets, to select the one we want, first load using xls = pd.ExcelFile('data.xlsx')
Then use pd.read_excel(xls, 'name_of_sheet') to get sheet data from each dataset
"""


@app.route("/")
def index():
    print("hi")
    return send_from_directory(app.static_folder, "index.html")

@app.route("/receive-date")
def receive_date():
    data = request.get_json() # gets the data from update YY_MM buttons

    year = data.get("year")
    month = data.get("month")

    print(f"Updated year -> {year} and month -> {month}")

    return jsonify({"status" : "updated"})

@app.route("/upload", methods=["POST", "OPTIONS"])
def upload_files():

    print("\n========== /upload HIT ==========")
    print("Method:", request.method)

    if request.method == "OPTIONS":
        print("OPTIONS PREFLIGHT RECEIVED")
        return "", 200
    print("Uploading files ....")
    # Access files by the SAME names used in FormData
    paycom1 = request.files.get("paycom1")
    paycom2 = request.files.get("paycom2")
    health = request.files.get("health")

    year = request.form.get("year")
    month = request.form.get("month")
    provider = request.form.get("provider")
    metric = request.form.get("metric")

    unumType = request.form.get("unumType")

    date = year + ' ' + month

    if not month or not year:
        raise Exception("Please select the Year and Month first")

    if not provider:
        raise Exception("Please select a Health Provider")

    # Validation
    if not paycom1 or not paycom2 or not health:
        return jsonify({"error": "Missing file(s)"}), 400


    # Merge Paycom stubs with desired metrics 
    paycom_cleaned = combine_paycom_data(pd.read_excel(paycom1), pd.read_excel(paycom2))

    # Save DataFrame to in-memory Excel file
    output = io.BytesIO()
    paycom_cleaned.to_excel(output, index=False)
    output.seek(0)  # rewind the buffer

    # Transform healthcare data (example: vendor="kaiser")
    df_health = pd.read_excel(health, date) #TODO: THE DATE NEEDS TO BE INFERED OR ASKED NOT HARD WIRED <DONE: it's chosen by user>
    df_health_transformed = transform_healthcare(df_health, vendor=provider, unumType=unumType)

    # Compare Paycom vs healthcare
    data = create_comparison_df(paycom_cleaned, df_health_transformed, col=metric, unumType=unumType)

    # Keep only rows where match == False
    mismatches = data

    print("The data:", mismatches)
    name_map = create_name_map(paycom_cleaned)   # <-- use the original dataset

    # Return the full comparison as JSON - orient records creates a list of dictionaries
    # Replace all NaN/inf values with None
    # 1. Normalize types
    mismatches["eecode"] = mismatches["eecode"].astype(str)
    name_map = create_name_map(df_health_transformed)

    # 2. Fill missing names using pandas NaN
    mismatches["Name"] = (
        mismatches["Name"]
        .fillna(mismatches["eecode"].map(name_map))
    )

    # 3. ONLY at the end (if required for JSON)
    mismatches = mismatches.replace({np.nan: None, np.inf: None, -np.inf: None})

    # This makes it so names are never empty even if payroll is 0 or NaN
    # Apply the mapping
   # print("Name MAP", name_map)
    mismatches['Name'] = (
        mismatches['eecode']
        .map(name_map)
        .fillna(mismatches['Name'])  # preserve existing names
    )

    mismatches["Name"] = (
        mismatches["Name"]
        .fillna(mismatches["eecode"].map(name_map))
    )

    mismatches = mismatches.replace({np.nan: None, np.inf: None, -np.inf: None})

    print("The data AFTER NAME ADD:", mismatches)

    # Convert to list of dicts for JSON
    records = mismatches.to_dict(orient="records")
    
    print("Final backend result:\n", records)
    return jsonify(records)

@app.route("/get-data")
def get_data():
    # Example DataFrame
    df = upload_files()
    
    # Convert to list of dicts (JSON serializable)
    data = df.to_dict(orient="records")
    return jsonify(data)

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