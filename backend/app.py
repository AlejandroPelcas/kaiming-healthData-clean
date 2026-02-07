#@Author: Alejandro Pelcastre
import pandas as pd
import numpy as np
from util import transform_paycom, transform_healthcare, create_comparison_df, combine_paycom_data, create_name_map
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import io

UPLOAD_FOLDER = "uploads"   # ← MUST be defined first
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    static_folder="frontend/build",
    static_url_path=""
)

CORS(app) # allow all origins for simplicity
"""
Load the data in. Expect input to be in .xlsx format
Each Excel file has multiple sheets, to select the one we want, first load using xls = pd.ExcelFile('data.xlsx')
Then use pd.read_excel(xls, 'name_of_sheet') to get sheet data from each dataset
"""


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/receive-date")
def receive_date():
    data = request.get_json() # gets the data from update YY_MM buttons

    year = data.get("year")
    month = data.get("month")

    print(f"Updated year -> {year} and month -> {month}")

    return jsonify({"status" : "updated"})

@app.route("/upload", methods=["POST"])
def upload_files():
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
    print("Name MAP", name_map)
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

    return jsonify(records)

@app.route("/get-data")
def get_data():
    # Example DataFrame
    df = upload_files()
    
    # Convert to list of dicts (JSON serializable)
    data = df.to_dict(orient="records")
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=False)