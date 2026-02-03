#TODO: Add more providers here
PAYCOM_COLS = [
    'eecode',
    'eename',
    'dkrm', 
    'dcmp', 
    'duhm', 
    'dvsn', 
    'ddnt', 
    'dchi',
    # Jan 28 - Adding UNUM variables
    'devl',
    'deva',
    'dsvl',
    'dsva',
    'dcvl',
    'dcva',
    ]

def transform_paycom(df):
    """
    Keep required columns and normalize eecode safely.
    """
    cols = PAYCOM_COLS
    df = df.loc[:, cols].copy()

    df['eecode'] = (
        df['eecode']
        .astype('string')
        .str.strip()
        .replace('nan', pd.NA)
    )

    return df
import pandas as pd

#TODO: Finish the func so that inputing two paycom files combines em
def combine_paycom_data(p1, p2):
    """ Take two paycom invoices of the same month and aggregate them into one df """
    # Clean up and normalize data
    p1 = transform_paycom(p1)
    p2 = transform_paycom(p2)


    #TODO: We want to make sure we count up all the eecodes instances.
    # aggregate duplicates per employee 
    agg_map = {
    'eename': 'first',   # names should be consistent
    'dkrm': 'sum',
    'dcmp': 'sum',
    'duhm': 'sum',
    'dvsn': 'sum',
    'ddnt': 'sum',
    'dchi': 'sum',
    # Jan 28 - Adding UNUM variables
    'devl': 'sum',
    'deva': 'sum',
    'dsvl': 'sum',
    'dsva': 'sum',
    'dcvl': 'sum',
    'dcva': 'sum',
    }

    p1 = (
    p1
    .groupby('eecode', as_index=True)
    .agg(agg_map)
    )

    p2 = (
        p2
        .groupby('eecode', as_index=True)
        .agg(agg_map)
    )

    # add numeric columns safely ---
    numeric_cols = [
        'dkrm', 
        'dcmp', 
        'duhm', 
        'dvsn', 
        'ddnt', 
        'dchi',
        # Jan 28 - Adding UNUM variables
        'devl',
        'deva',
        'dsvl',
        'dsva',
        'dcvl',
        'dcva',
        ]

    paycom_master = p1.copy()

    paycom_master[numeric_cols] = (
        p1[numeric_cols]
        .add(p2[numeric_cols], fill_value=0)
    )
    paycom_master = paycom_master.reset_index()
    print("--------- Outputing cleaned paycom---------")
    return paycom_master

def transform_healthcare(df, vendor: str, unumType: str):
    """
    Transform healthcare data for different vendors into a consistent format.
    Output columns: ['eecode', 'eename', 'EE Deductable']
    """
    df = df.copy()

    payroll_code_map = {
    'devl' : 'EE LIFE',
    'deva' : 'EE AD&D',
    'dsvl' : 'SP LIFE',
    'dsva' : 'SP AD&D',
    'dcvl' : 'CH LIFE',
    'dcva' : 'CH AD&D',
}
    
    if vendor.lower() == 'kaiser':
        df = df[3:].copy()
        # Columns: EE Code [1], Last Name [2], First Name [3], EE Deduction [7]
        df = df.iloc[:, [1, 2, 3, 7]]
        df.columns = ['eecode', 'Last Name', 'First Name', 'EE Deductable']
        df['eename'] = df['First Name'].str.strip() + ' ' + df['Last Name'].str.strip()
    
    elif vendor.lower() == 'united_cchp':
        df = df[3:].copy()
        # Columns: EEID [1], Name [2], EE Deductable [5]
        df = df.iloc[:, [1, 2, 5]]
        df.columns = ['eecode', 'eename', 'EE Deductable']

    elif vendor.lower() == 'vision':
        df = df[2:].copy()
        # Columns: eecode[0], name[1], ee deduct vision[8]
        df = df.iloc[:, [0, 1, 8]]
        df.columns = ['eecode', 'name', 'EE Deductable']
        df['eename'] = df['name'].str.strip()  # standardize column
        df = df[['eecode', 'eename', 'EE Deductable']]

    elif vendor.lower() == 'dental':
        df = df[2:].copy()
        # Columns: eecode[0], name[1], ee deduct dental[5]
        df = df.iloc[:, [0, 1, 5]]
        df.columns = ['eecode', 'name', 'EE Deductable']
        df['eename'] = df['name'].str.strip()  # standardize column
        df = df[['eecode', 'eename', 'EE Deductable']]

    elif vendor.lower() == 'landmark':
        df = df[2:].copy()
        df = df.iloc[:,[0,1,3]] # [eecode , name, EE Deduction]
        df.columns = ['eecode','name','EE Deductable']
        df['eename'] = df['name'].str.strip()  # standardize column
        df = df[['eecode', 'eename', 'EE Deductable']]

    elif vendor.lower() == 'unum':
        print("Vendor is ", vendor.lower(), "and unumtype is ", unumType)
        df = df[3:].copy() # remove top 3 rows because they're not data
        df = df.iloc[:, [1,2,3,5]] # [eeid, name, plan_name, amount]
        df.columns = ['eecode', 'name', 'plan_name', 'EE Deductable']
        df['eename'] = df['name'].str.strip()  # rename 'name' to 'eename'
        df = df[df['plan_name'] == payroll_code_map[unumType]]
        df = df[['eecode', 'eename', 'EE Deductable']]

        df = df.dropna(subset=['eecode']) #There's NaN rows to seperate people, remove those dead rows

    else:
        raise ValueError("Vendor must be 'kaiser', 'united_cchp', 'vision', 'landmark', 'dental', or 'unum'")

    # Drop rows with missing eecode
    df = df.dropna(subset=['eecode'])
    df['eecode'] = df['eecode'].astype(str).str.strip()
    df['EE Deductable'] = pd.to_numeric(df['EE Deductable'], errors='coerce')
    df = df.drop_duplicates() #TODO: NEED TO CHANGE THIS TO AGGREGATE DUPLICATES NOT DROP THEM


    return df.reset_index(drop=True)


def create_comparison_df(df_1, df_2, col, unumType):
    comparison = df_1.merge(
        df_2,
        on='eecode',
        how='outer',
        suffixes=('_df1', '_df2')
    )

    # If we're doing unumType, that is the metric
    if unumType and col == 'unum':
        col = unumType
    print("Unumtype and col:", unumType, col)
    # EE Deducition is object not float. Change that
    comparison.columns = comparison.columns.str.strip() # Removes trailing white space
    print("Comparison Columns: [", comparison.columns,"]")
    comparison["EE Deductable"] = pd.to_numeric(comparison["EE Deductable"], errors="coerce")
    comparison[col] = pd.to_numeric(comparison[col], errors="coerce")
    # Create match column that is a boolean
    comparison["match"] = (
        (comparison[col] == comparison["EE Deductable"])  |
        (comparison[col].isna() & comparison["EE Deductable"].isna())  |
        (comparison[col].fillna(0.0) == comparison["EE Deductable"].fillna(0.0))  
    )
    # Show difference if any between paycom and provider
    comparison["difference"] = (
    comparison[col].fillna(0) - comparison["EE Deductable"].fillna(0)
    ).round(2)


    # Update match column to ignore tiny differences (<0.05)
    comparison["match"] = comparison["match"] | (comparison["difference"].abs() < 0.05)

    # Filter rows where match is False and print
    # Filter mismatches

    columns = ['eecode',col,"EE Deductable", 'difference']
    if col in ['duhm']:
        columns.append('eename_df1')
    elif col in ['dvsn', 'ddnt', 'dkrm','dcmp', 'dchi', 'devl','deva','dsvl','dsva','dcvl','dcva']:
        columns.append('eename_df1')


    mismatches = comparison.loc[~comparison['match'], columns]

    mismatches = mismatches.rename(columns={'eename_df1': 'Name', 'EE Deductable': 'Invoice',})
    # Set the column order 
    
    # Print list of eecodes with mismatches
    print(f"There are mismatches for eecode(s): {mismatches['eecode'].tolist()}")
    
    # Sum the variance per eecode
    variance_per_eecode = mismatches.groupby('eecode')['difference'].sum().round(2)
    
    # Print nicely
    for ee, var in variance_per_eecode.items():
        print(f"Total variance for eecode {ee}: {var}")


    return mismatches


