"""
Indian Financial Metrics Explainer
====================================
Detects Indian-specific financial terms in text and returns
tooltip-ready explanations for retail investors.
"""

import re
from typing import Optional

# ===================================
# Term dictionary
# ===================================

METRIC_EXPLANATIONS: dict[str, dict] = {
    "ROCE": {
        "full": "Return on Capital Employed",
        "explain": "Measures how efficiently a company uses its capital to generate profit. Higher is better — 15%+ is considered good for most industries.",
        "formula": "EBIT / Capital Employed × 100",
        "good_range": ">15%",
    },
    "ROE": {
        "full": "Return on Equity",
        "explain": "How much profit the company generates per rupee of shareholder equity. Shows how well management is using investor money.",
        "formula": "Net Profit / Shareholders' Equity × 100",
        "good_range": ">15%",
    },
    "EBITDA": {
        "full": "Earnings Before Interest, Taxes, Depreciation & Amortisation",
        "explain": "A proxy for operating cash flow. Strips out accounting items to show the raw earning power of the business.",
        "formula": "Revenue - Operating Expenses (excl. ITDA)",
        "good_range": "Margin >20% is strong",
    },
    "PAT": {
        "full": "Profit After Tax",
        "explain": "The final net profit that belongs to shareholders after all expenses, interest, and taxes are paid.",
        "formula": "PBT - Tax",
        "good_range": "Depends on sector",
    },
    "DII": {
        "full": "Domestic Institutional Investors",
        "explain": "Indian institutions like mutual funds, insurance companies, and banks investing in Indian markets. High DII buying is often seen as a positive signal.",
        "formula": None,
        "good_range": "Rising DII = bullish signal",
    },
    "FII": {
        "full": "Foreign Institutional Investors",
        "explain": "Foreign funds investing in Indian markets. FII flows heavily influence short-term market direction — heavy selling can trigger market-wide falls.",
        "formula": None,
        "good_range": "FII inflow = market positive",
    },
    "FPI": {
        "full": "Foreign Portfolio Investors",
        "explain": "Same as FII — the SEBI-updated term for foreign investors buying Indian stocks/bonds without taking management control.",
        "formula": None,
        "good_range": "FPI inflow = market positive",
    },
    "pledge": {
        "full": "Promoter Pledge Ratio",
        "explain": "% of promoter shares pledged as collateral for loans. High pledge (>50%) is a red flag — if the stock falls, lenders can force-sell, crashing the price further.",
        "formula": "Pledged Shares / Total Promoter Shares × 100",
        "good_range": "<10% is safe, >50% is danger zone",
    },
    "pledged": {
        "full": "Promoter Pledge Ratio",
        "explain": "% of promoter shares pledged as collateral for loans. High pledge (>50%) is a red flag — if the stock falls, lenders can force-sell, crashing the price further.",
        "formula": "Pledged Shares / Total Promoter Shares × 100",
        "good_range": "<10% is safe, >50% is danger zone",
    },
    "P/E": {
        "full": "Price-to-Earnings Ratio",
        "explain": "How many years of current earnings you're paying for the stock. A P/E of 20 means you're paying ₹20 for every ₹1 of annual profit.",
        "formula": "Stock Price / EPS",
        "good_range": "Relative to sector average",
    },
    "EPS": {
        "full": "Earnings Per Share",
        "explain": "How much profit the company made per share. Directly tied to dividends and is a key driver of stock price.",
        "formula": "Net Profit / Total Shares Outstanding",
        "good_range": "Rising EPS = good sign",
    },
    "CAGR": {
        "full": "Compound Annual Growth Rate",
        "explain": "Smoothed annual growth rate over multiple years. A 5-year revenue CAGR of 15% means the business doubled roughly every 5 years.",
        "formula": "(End Value / Start Value)^(1/years) - 1",
        "good_range": ">15% for growth stocks",
    },
    "OI": {
        "full": "Open Interest",
        "explain": "Total number of outstanding F&O contracts not yet settled. Rising OI with rising price = bullish. Rising OI with falling price = bearish.",
        "formula": None,
        "good_range": "Interpret with price direction",
    },
    "PCR": {
        "full": "Put-Call Ratio",
        "explain": "Ratio of put options to call options traded. PCR > 1 means more puts (bearish bets). Often used as a contrarian indicator — extreme PCR can signal reversal.",
        "formula": "Total Put OI / Total Call OI",
        "good_range": "0.7–1.2 is neutral; >1.3 = oversold",
    },
    "EBIDTA": {  # common typo
        "full": "EBITDA (typo variant)",
        "explain": "Same as EBITDA — Earnings Before Interest, Taxes, Depreciation & Amortisation.",
        "formula": None,
        "good_range": "Margin >20% is strong",
    },
    "NPA": {
        "full": "Non-Performing Asset",
        "explain": "Loans where the borrower has stopped repaying (90+ days overdue). High NPA ratios in banks indicate poor loan quality and risk of write-offs.",
        "formula": "Gross NPA / Total Loans × 100",
        "good_range": "<2% is healthy for banks",
    },
    "GNPA": {
        "full": "Gross Non-Performing Assets",
        "explain": "Total bad loans before deducting provisions. A key health metric for banks and NBFCs.",
        "formula": "Bad Loans / Total Loan Book × 100",
        "good_range": "<2% is healthy",
    },
}

# Build regex from all known terms (longest match first to avoid partial hits)
_SORTED_TERMS = sorted(METRIC_EXPLANATIONS.keys(), key=len, reverse=True)
_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in _SORTED_TERMS) + r")\b",
    re.IGNORECASE,
)


# ===================================
# Public API
# ===================================

def detect_metrics(text: str) -> list[dict]:
    """
    Scan text for Indian financial metrics and return a deduplicated list
    of detected terms with their explanations.

    Returns:
        [{"term": "ROCE", "full": "...", "explain": "...", "good_range": "..."}, ...]
    """
    seen: set[str] = set()
    results: list[dict] = []

    for match in _PATTERN.finditer(text):
        key = match.group(0).upper()
        # Normalise pledge/pledged → pledge
        if key == "PLEDGED":
            key = "PLEDGE"

        # Look up in dict (try exact, then title-case, then lowercase)
        entry = (
            METRIC_EXPLANATIONS.get(key)
            or METRIC_EXPLANATIONS.get(match.group(0))
            or METRIC_EXPLANATIONS.get(match.group(0).lower())
        )
        if entry is None:
            continue

        canonical = key
        if canonical not in seen:
            seen.add(canonical)
            results.append({
                "term": match.group(0),  # preserve original casing
                "full": entry["full"],
                "explain": entry["explain"],
                "formula": entry.get("formula"),
                "good_range": entry.get("good_range"),
            })

    return results


def get_metric_explanation(term: str) -> Optional[dict]:
    """Get explanation for a single term (case-insensitive)."""
    key = term.upper()
    return METRIC_EXPLANATIONS.get(key) or METRIC_EXPLANATIONS.get(term)
