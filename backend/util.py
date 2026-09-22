"""
Reconcile Paycom payroll deductions against benefits-vendor invoices.

Output is logged rather than printed. To see the INFO-level summaries, add this
once at the top of your script or notebook:

    import logging
    logging.basicConfig(level=logging.INFO)   # or DEBUG to see full DataFrames
"""
import logging

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Paycom deduction codes that get summed and reconciled.
NUMERIC_COLS = [
    'dkrm',
    'dcmp',
    'duhm',
    'dvsn',
    'ddnt',
    'dchi',
    # Jan 28 - UNUM deductions
    'devl',  # EE life
    'deva',  # EE AD&D
    'dsvl',  # spouse life
    'dsva',  # spouse AD&D
    'dcvl',  # child life
    'dcva',  # child AD&D
]

PAYCOM_COLS = ['eecode', 'eename', *NUMERIC_COLS]

# UNUM payroll code -> plan name as it appears on the UNUM invoice.
UNUM_PLAN_NAMES = {
    'devl': 'EE LIFE',
    'deva': 'EE AD&D',
    'dsvl': 'SP LIFE',
    'dsva': 'SP AD&D',
    'dcvl': 'CH LIFE',
    'dcva': 'CH AD&D',
}

# Invoice layouts: vendor -> (header rows to skip, column positions, names for those columns)
VENDOR_LAYOUTS = {
    'kaiser':      (3, [1, 2, 3, 7], ['eecode', 'last_name', 'first_name', 'EE Deductable']),
    'united_cchp': (3, [1, 2, 5],    ['eecode', 'eename', 'EE Deductable']),
    'vision':      (2, [0, 1, 8],    ['eecode', 'eename', 'EE Deductable']),
    'dental':      (2, [0, 1, 5],    ['eecode', 'eename', 'EE Deductable']),
    'landmark':    (2, [0, 1, 3],    ['eecode', 'eename', 'EE Deductable']),
    'unum':        (3, [1, 2, 3, 5], ['eecode', 'eename', 'plan_name', 'EE Deductable']),
}

# Payroll and invoice amounts within this many dollars count as a match.
MATCH_TOLERANCE = 0.05


# ---------------------------------------------------------------------------
# Paycom
# ---------------------------------------------------------------------------

def transform_paycom(df):
    """
    Keep the required Paycom columns and normalize them.

    Any missing column (e.g. 'duhm') is added and filled with 0.
    Returns (cleaned_df, list_of_missing_columns).
    """
    df = df.copy()

    missing_cols = [c for c in PAYCOM_COLS if c not in df.columns]
    for col in missing_cols:
        df[col] = 0

    df = df[PAYCOM_COLS].copy()

    # Make sure deduction amounts are numbers so they sum correctly.
    numeric = df[NUMERIC_COLS].apply(pd.to_numeric, errors='coerce')
    bad_values = numeric.isna() & df[NUMERIC_COLS].notna()
    if bad_values.any().any():
        logger.warning("%d non-numeric payroll value(s) were treated as blank",
                       int(bad_values.sum().sum()))
    df[NUMERIC_COLS] = numeric

    df['eecode'] = (
        df['eecode']
        .astype('string')
        .str.strip()
        .replace('nan', pd.NA)
    )

    return df, missing_cols


def combine_paycom_data(p1, p2):
    """Combine two Paycom reports for the same month into one row per employee."""
    p1, missing1 = transform_paycom(p1)
    p2, missing2 = transform_paycom(p2)

    missing_cols = sorted(set(missing1) | set(missing2))
    if missing_cols:
        logger.warning("Missing payroll columns (filled with 0): %s", missing_cols)

    agg_map = {'eename': 'first', **{col: 'sum' for col in NUMERIC_COLS}}

    # Stack both reports, then total every deduction per employee in one pass.
    paycom_master = (
        pd.concat([p1, p2], ignore_index=True)
        .groupby('eecode', as_index=False)
        .agg(agg_map)
    )

    logger.info("Combined Paycom data: %d employees", len(paycom_master))
    return paycom_master


# ---------------------------------------------------------------------------
# Vendor invoices
# ---------------------------------------------------------------------------

def transform_healthcare(df, vendor: str, unumType: str | None = None):
    """
    Transform a vendor invoice into a consistent format, one row per employee.

    Output columns: ['eecode', 'eename', 'EE Deductable']
    For vendor='unum', unumType (e.g. 'devl') selects which plan to keep.
    """
    vendor = vendor.lower()
    if vendor not in VENDOR_LAYOUTS:
        raise ValueError(f"Vendor must be one of {sorted(VENDOR_LAYOUTS)}, got {vendor!r}")

    skip_rows, col_positions, col_names = VENDOR_LAYOUTS[vendor]
    df = df.iloc[skip_rows:, col_positions].copy()
    df.columns = col_names

    if vendor == 'kaiser':
        df['eename'] = df['first_name'].str.strip() + ' ' + df['last_name'].str.strip()

    elif vendor == 'unum':
        if unumType not in UNUM_PLAN_NAMES:
            raise ValueError(
                f"For UNUM, unumType must be one of {sorted(UNUM_PLAN_NAMES)}, got {unumType!r}"
            )
        logger.info("UNUM invoice: keeping plan %r (%s)", UNUM_PLAN_NAMES[unumType], unumType)
        df = df[df['plan_name'] == UNUM_PLAN_NAMES[unumType]]

    df['eename'] = df['eename'].str.strip()

    # Blank eecode rows are separators/headers, not employees.
    df = df.dropna(subset=['eecode'])
    df['eecode'] = df['eecode'].astype(str).str.strip()
    df['EE Deductable'] = pd.to_numeric(df['EE Deductable'], errors='coerce')

    # Total any duplicate lines per employee (rather than dropping them).
    df = (
        df
        .groupby('eecode', as_index=False)
        .agg({'eename': 'first', 'EE Deductable': 'sum'})
    )
    df['EE Deductable'] = df['EE Deductable'].round(2)

    logger.debug("Transformed %s invoice:\n%s", vendor, df)
    return df


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def create_comparison_df(df_1, df_2, col, unumType=None):
    """
    Compare a payroll column in df_1 (Paycom) against 'EE Deductable' in df_2 (invoice).

    Returns only the mismatched rows, with difference = PAYROLL - INVOICE.
    Pass col='unum' together with unumType to compare a specific UNUM code.
    """
    if col == 'unum':
        if not unumType:
            raise ValueError("unumType is required when col='unum'")
        col = unumType

    comparison = df_1.merge(df_2, on='eecode', how='outer', suffixes=('_df1', '_df2'))
    comparison.columns = comparison.columns.str.strip()
    logger.debug("Comparison for %s:\n%s", col, comparison)

    comparison[col] = pd.to_numeric(comparison[col], errors='coerce').fillna(0)
    comparison['EE Deductable'] = pd.to_numeric(comparison['EE Deductable'], errors='coerce')

    # PAYROLL - INVOICE = DIFFERENCE (anyone missing from a side counts as 0 there)
    comparison['difference'] = (
        comparison[col] - comparison['EE Deductable'].fillna(0)
    ).round(2)
    comparison['match'] = comparison['difference'].abs() < MATCH_TOLERANCE

    output_cols = ['eecode', col, 'EE Deductable', 'difference']
    if 'eename_df1' in comparison:
        # Prefer the Paycom name; fall back to the invoice name for people not in payroll.
        comparison['Name'] = comparison['eename_df1'].fillna(comparison['eename_df2'])
        output_cols.append('Name')

    mismatches = (
        comparison.loc[~comparison['match'], output_cols]
        .rename(columns={'EE Deductable': 'Invoice'})
    )

    if mismatches.empty:
        logger.info("%s: no mismatches", col)
    else:
        logger.info("%s: %d mismatch(es), net variance %.2f",
                    col, len(mismatches), mismatches['difference'].sum())
        for eecode, diff in zip(mismatches['eecode'], mismatches['difference']):
            logger.info("  eecode %s: variance %.2f", eecode, diff)

    return mismatches


def create_name_map(health_data_transformed):
    """Return {eecode: name} from a transformed invoice DataFrame."""
    df = health_data_transformed
    return dict(zip(df['eecode'].astype(str), df['eename'].astype(str).str.strip()))