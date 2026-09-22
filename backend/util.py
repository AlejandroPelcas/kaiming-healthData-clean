"""
Reconcile Paycom payroll deductions against benefits-vendor invoices.

Output is logged rather than printed. app.py turns on INFO-level logging;
in a notebook, add:

    import logging
    logging.basicConfig(level=logging.INFO)   # or DEBUG to see full DataFrames
"""
import logging

import numpy as np
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

# Mismatch categories stored with each comparison row.
MISMATCH_TYPES = {
    'match':        'Match',
    'amount_diff':  'Amounts differ',
    'payroll_only': 'Deducted, not billed',
    'invoice_only': 'Billed, not deducted',
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def normalize_eecode(series):
    """
    Make employee codes comparable across files and months.

    Excel sometimes reads codes as numbers, so 1234 arrives as "1234.0".
    This strips whitespace and any trailing ".0", and turns blanks into NA.
    """
    codes = (
        series
        .astype('string')
        .str.strip()
        .str.replace(r'\.0+$', '', regex=True)
    )
    return codes.mask(codes.isin(['', 'nan', 'None', '<NA>']))


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

    df['eecode'] = normalize_eecode(df['eecode'])

    return df, missing_cols


def paycom_by_period(p1, p2):
    """
    Combine the two half-month Paycom registers, keeping each pay period's amount.

    Returns (payroll, missing_cols), where payroll is one row per employee per
    deduction code with columns: eecode, eename, code, amount_p1, amount_p2.
    Rows where both periods are zero are left out.
    """
    p1, missing1 = transform_paycom(p1)
    p2, missing2 = transform_paycom(p2)

    missing_cols = sorted(set(missing1) | set(missing2))
    if missing_cols:
        logger.warning("Missing payroll columns (filled with 0): %s", missing_cols)

    agg_map = {'eename': 'first', **{col: 'sum' for col in NUMERIC_COLS}}
    stacked = pd.concat(
        [
            p1.groupby('eecode', as_index=False).agg(agg_map).assign(period=1),
            p2.groupby('eecode', as_index=False).agg(agg_map).assign(period=2),
        ],
        ignore_index=True,
    )
    names = stacked.groupby('eecode')['eename'].first()

    payroll = (
        stacked
        .melt(id_vars=['eecode', 'period'], value_vars=NUMERIC_COLS,
              var_name='code', value_name='amount')
        .pivot_table(index=['eecode', 'code'], columns='period', values='amount',
                     aggfunc='sum', fill_value=0)
        .reindex(columns=[1, 2], fill_value=0)
        .rename(columns={1: 'amount_p1', 2: 'amount_p2'})
        .reset_index()
    )
    payroll.columns.name = None
    payroll = payroll[(payroll['amount_p1'] != 0) | (payroll['amount_p2'] != 0)].copy()
    payroll[['amount_p1', 'amount_p2']] = payroll[['amount_p1', 'amount_p2']].round(2)
    payroll['eename'] = payroll['eecode'].map(names)

    logger.info("Combined Paycom data: %d employees", payroll['eecode'].nunique())
    return payroll[['eecode', 'eename', 'code', 'amount_p1', 'amount_p2']].reset_index(drop=True), missing_cols


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
        df = df[df['plan_name'] == UNUM_PLAN_NAMES[unumType]].copy()

    df['eename'] = df['eename'].str.strip()

    # Blank eecode rows are separators/headers, not employees.
    df['eecode'] = normalize_eecode(df['eecode'])
    df = df.dropna(subset=['eecode'])
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

def compare_payroll_to_invoice(payroll, invoice):
    """
    Compare one deduction code's payroll against a transformed invoice.

    payroll: eecode, eename, amount_p1, amount_p2   (from db.load_payroll)
    invoice: eecode, eename, EE Deductable          (from transform_healthcare)

    Returns every employee on either side, largest difference first, with:
      eecode, name, payroll, payroll_p1, payroll_p2, invoice,
      difference (PAYROLL - INVOICE), mismatch_type, one_paycheck
    """
    payroll = payroll.assign(eecode=payroll['eecode'].astype(str))
    invoice = invoice.assign(eecode=invoice['eecode'].astype(str))

    df = payroll.merge(invoice, on='eecode', how='outer', suffixes=('_payroll', '_invoice'))

    df['payroll_p1'] = df['amount_p1'].fillna(0)
    df['payroll_p2'] = df['amount_p2'].fillna(0)
    df['payroll'] = (df['payroll_p1'] + df['payroll_p2']).round(2)
    df['invoice'] = df['EE Deductable']
    df['difference'] = (df['payroll'] - df['invoice'].fillna(0)).round(2)
    # Prefer the Paycom name; fall back to the invoice name for people not in payroll.
    df['name'] = df['eename_payroll'].fillna(df['eename_invoice'])

    matched = df['difference'].abs() < MATCH_TOLERANCE
    no_payroll = df['payroll'].abs() < MATCH_TOLERANCE
    no_invoice = df['invoice'].fillna(0).abs() < MATCH_TOLERANCE
    df['mismatch_type'] = np.select(
        [matched, no_invoice, no_payroll],
        ['match', 'payroll_only', 'invoice_only'],
        default='amount_diff',
    )

    # A difference equal to one pay period's deduction usually means a missed
    # or doubled deduction on one of the two check registers.
    candidates = pd.concat(
        [df['payroll_p1'].abs(), df['payroll_p2'].abs(), (df['invoice'].fillna(0) / 2).abs()],
        axis=1,
    )
    near_one_period = (
        (candidates.sub(df['difference'].abs(), axis=0).abs() < MATCH_TOLERANCE)
        & (candidates >= MATCH_TOLERANCE)
    ).any(axis=1)
    df['one_paycheck'] = (df['mismatch_type'] == 'amount_diff') & near_one_period

    columns = ['eecode', 'name', 'payroll', 'payroll_p1', 'payroll_p2',
               'invoice', 'difference', 'mismatch_type', 'one_paycheck']
    df = df[columns]
    return df.loc[df['difference'].abs().sort_values(ascending=False).index].reset_index(drop=True)


def summarize_comparison(rows):
    """Headline numbers for one comparison (output of compare_payroll_to_invoice)."""
    mismatched = rows[rows['mismatch_type'] != 'match']
    summary = {
        'employees_compared': int(len(rows)),
        'mismatch_count': int(len(mismatched)),
        'payroll_total': round(float(rows['payroll'].sum()), 2),
        'invoice_total': round(float(rows['invoice'].fillna(0).sum()), 2),
        'net_variance': round(float(mismatched['difference'].sum()), 2),
        'gross_variance': round(float(mismatched['difference'].abs().sum()), 2),
    }
    logger.info("%d of %d employees mismatched, net %.2f, gross %.2f",
                summary['mismatch_count'], summary['employees_compared'],
                summary['net_variance'], summary['gross_variance'])
    return summary


def find_repeat_offenders(mismatch_history, runs, min_streak=2):
    """
    Employees mismatched in at least `min_streak` consecutive months
    for the same provider and payroll code.

    mismatch_history: from db.load_mismatch_history
    runs:             DataFrame of db.list_runs (used to tell if a streak is ongoing)
    """
    columns = ['provider', 'metric', 'eecode', 'name', 'months_mismatched',
               'longest_streak', 'current_streak', 'latest_year', 'latest_month',
               'latest_difference']
    if mismatch_history.empty or runs.empty:
        return pd.DataFrame(columns=columns)

    history = mismatch_history.assign(
        period=mismatch_history['year'] * 12 + mismatch_history['month'] - 1
    )
    latest_run = (
        runs.assign(period=runs['year'] * 12 + runs['month'] - 1)
        .groupby(['provider', 'metric'])['period']
        .max()
    )

    results = []
    for (provider, metric, eecode), group in (
        history.sort_values('period').groupby(['provider', 'metric', 'eecode'])
    ):
        periods = group['period'].tolist()
        longest = streak = 1
        for previous, current in zip(periods, periods[1:]):
            streak = streak + 1 if current == previous + 1 else 1
            longest = max(longest, streak)

        if longest < min_streak:
            continue

        # The streak only counts as ongoing if it reaches the latest month compared.
        ongoing = periods[-1] == latest_run.get((provider, metric))
        last = group.iloc[-1]
        results.append({
            'provider': provider,
            'metric': metric,
            'eecode': eecode,
            'name': last['name'],
            'months_mismatched': len(periods),
            'longest_streak': longest,
            'current_streak': streak if ongoing else 0,
            'latest_year': int(last['year']),
            'latest_month': int(last['month']),
            'latest_difference': float(last['difference']),
        })

    if not results:
        return pd.DataFrame(columns=columns)
    return (
        pd.DataFrame(results, columns=columns)
        .sort_values(['current_streak', 'longest_streak', 'months_mismatched'], ascending=False)
        .reset_index(drop=True)
    )


# ---------------------------------------------------------------------------
# Legacy helpers (no longer used by app.py; kept for notebooks and scripts)
# ---------------------------------------------------------------------------

def combine_paycom_data(p1, p2):
    """Combine two Paycom reports for the same month into one row per employee."""
    p1, missing1 = transform_paycom(p1)
    p2, missing2 = transform_paycom(p2)

    missing_cols = sorted(set(missing1) | set(missing2))
    if missing_cols:
        logger.warning("Missing payroll columns (filled with 0): %s", missing_cols)

    agg_map = {'eename': 'first', **{col: 'sum' for col in NUMERIC_COLS}}
    return (
        pd.concat([p1, p2], ignore_index=True)
        .groupby('eecode', as_index=False)
        .agg(agg_map)
    )


def create_comparison_df(df_1, df_2, col, unumType=None):
    """
    Compare a payroll column in df_1 (Paycom) against 'EE Deductable' in df_2 (invoice).
    Returns only the mismatched rows, with difference = PAYROLL - INVOICE.
    """
    if col == 'unum':
        if not unumType:
            raise ValueError("unumType is required when col='unum'")
        col = unumType

    comparison = df_1.merge(df_2, on='eecode', how='outer', suffixes=('_df1', '_df2'))
    comparison.columns = comparison.columns.str.strip()

    comparison[col] = pd.to_numeric(comparison[col], errors='coerce').fillna(0)
    comparison['EE Deductable'] = pd.to_numeric(comparison['EE Deductable'], errors='coerce')
    comparison['difference'] = (
        comparison[col] - comparison['EE Deductable'].fillna(0)
    ).round(2)
    comparison['match'] = comparison['difference'].abs() < MATCH_TOLERANCE

    output_cols = ['eecode', col, 'EE Deductable', 'difference']
    if 'eename_df1' in comparison:
        comparison['Name'] = comparison['eename_df1'].fillna(comparison['eename_df2'])
        output_cols.append('Name')

    return (
        comparison.loc[~comparison['match'], output_cols]
        .rename(columns={'EE Deductable': 'Invoice'})
    )


def create_name_map(health_data_transformed):
    """Return {eecode: name} from a transformed invoice DataFrame."""
    df = health_data_transformed
    return dict(zip(df['eecode'].astype(str), df['eename'].astype(str).str.strip()))