import pandas as pd

# input files
LIFE_CSV = "public/data/life-expectancy.csv"
GDP_CSV = "public/data/gdp-per-capita-worldbank.csv"

# output file
OUT_CSV = "public/data/merged_latest.csv"

def load_data(path):
    df = pd.read_csv(path)

    # finding the data column
    cols = [c for c in df.columns if c not in ["Entity", "Code", "Year"]]
    value_col = cols[0]

    df = df.rename(columns={
        "Entity": "country",
        "Code": "iso3",
        "Year": "year",
        value_col: "value"
    })

    return df[["country", "iso3", "year", "value"]]

def keep_countries(df):
    df = df.dropna(subset=["iso3"])
    df = df[df["iso3"].str.len() == 3]
    return df

life = keep_countries(load_data(LIFE_CSV))
life = life.rename(columns={"value": "life_expectancy"})

gdp = keep_countries(load_data(GDP_CSV))
gdp = gdp.rename(columns={"value": "gdp_per_capita"})

# keeping years that exist in both datasets
years_in_common = pd.merge(
    life[["iso3", "year"]],
    gdp[["iso3", "year"]],
    on=["iso3", "year"]
)

# choosing most recent year per country
latest_year = years_in_common.groupby("iso3")["year"].max().reset_index()

# merging values
merged = pd.merge(latest_year, life, on=["iso3", "year"])
merged = pd.merge(merged, gdp[["iso3", "year", "gdp_per_capita"]], on=["iso3", "year"])

merged.to_csv(OUT_CSV, index=False)

print("Saved:", OUT_CSV)
