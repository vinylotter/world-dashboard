import pandas as pd
from pathlib import Path

DATA_DIR = Path("public/data")
OUT_CSV = DATA_DIR / "world_metrics.csv"

def find_file(keyword):
    for f in sorted(DATA_DIR.glob("*.csv")):
        if keyword.lower() in f.name.lower():
            return f
    raise FileNotFoundError(f"Could not find a CSV in {DATA_DIR} with keyword '{keyword}'")

def read_owid_csv(path, value_col_name, out_value_name, keep_country):
    df = pd.read_csv(path)

    print(f"\nColumns found in: {path}")
    print(df.columns)

    for col in ["Entity", "Code", "Year"]:
        if col not in df.columns:
            raise ValueError(f"{path} must include {col}")

    if value_col_name not in df.columns:
        raise ValueError(
            f"{path} does not have column '{value_col_name}'. Columns are: {list(df.columns)}"
        )

    cols = ["Code", "Year", value_col_name]
    if keep_country:
        cols = ["Entity"] + cols

    df = df[cols].copy()

    # Rename to our standard names
    df = df.rename(columns={
        "Entity": "country",
        "Code": "iso3",
        "Year": "year",
        value_col_name: out_value_name
    })

    # Convert types
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df[out_value_name] = pd.to_numeric(df[out_value_name], errors="coerce")

    # Keep only real countries (3-letter ISO codes)
    df = df[df["iso3"].notna()]
    df = df[df["iso3"].astype(str).str.len() == 3]

    return df

def pick_internet_value_col(cols):
    options = [
        "Share of the population using the Internet",
        "Individuals using the Internet (% of population)",
        "Internet users (% of population)"
    ]
    for c in options:
        if c in cols:
            return c
    return None

def main():
    # Find files (no hardcoded filenames)
    gdp_file = find_file("gdp-per-capita")
    life_file = find_file("life-expectancy")
    internet_file = find_file("internet")  # your file is internet-users.csv
    pop_file = find_file("population")

    # Read: keep country ONLY in GDP to avoid merge conflicts
    gdp = read_owid_csv(gdp_file, "GDP per capita", "gdp_per_capita", keep_country=True)
    life = read_owid_csv(life_file, "Life expectancy", "life_expectancy", keep_country=False)

    internet_cols = pd.read_csv(internet_file, nrows=1).columns
    internet_value_col = pick_internet_value_col(internet_cols)
    if internet_value_col is None:
        raise ValueError(f"Internet file {internet_file} has unexpected columns: {list(internet_cols)}")

    internet = read_owid_csv(internet_file, internet_value_col, "internet_users_pct", keep_country=False)

    # YOUR population file column is "Population, total" (not "Population")
    pop = read_owid_csv(pop_file, "Population, total", "population", keep_country=False)

    # Merge safely on iso3 + year
    merged = gdp.merge(life, on=["iso3", "year"], how="outer")
    merged = merged.merge(internet, on=["iso3", "year"], how="outer")
    merged = merged.merge(pop, on=["iso3", "year"], how="outer")

    # Sort + save
    merged = merged.sort_values(["iso3", "year"])
    merged.to_csv(OUT_CSV, index=False)

    print(f"\nSaved: {OUT_CSV}")
    print("Rows:", len(merged))
    print("Columns:", list(merged.columns))

if __name__ == "__main__":
    main()