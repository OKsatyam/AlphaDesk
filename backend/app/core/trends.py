"""
Cross-Document Trend Detector
==============================
When multiple documents are uploaded for the same company,
extracts key financial metrics and compares them across periods.

Works purely on ChromaDB — no external API needed.
Metrics extracted via regex from chunk text.
"""

import re
from typing import Optional
from app.db.chroma import get_collection


# ===================================
# Metric extraction patterns
# ===================================

# Matches: "Revenue: Rs 897128 Crore", "Revenue was 897128 crore", etc.
_METRIC_PATTERNS: dict[str, re.Pattern] = {
    "Revenue": re.compile(
        r"(?:revenue|turnover|total\s+income|sales)[^\d]*?(?:Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)\b",
        re.IGNORECASE,
    ),
    "PAT": re.compile(
        r"(?:PAT|profit\s+after\s+tax|net\s+profit)[^\d]*?(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)\b",
        re.IGNORECASE,
    ),
    "EBITDA": re.compile(
        r"EBITDA[^\d]*?(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)\b",
        re.IGNORECASE,
    ),
    "Net Debt": re.compile(
        r"net\s+debt[^\d]*?(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)\b",
        re.IGNORECASE,
    ),
    "Capex": re.compile(
        r"(?:capex|capital\s+expenditure)[^\d]*?(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)\b",
        re.IGNORECASE,
    ),
}

# Detect the fiscal year from text
_FY_PATTERN = re.compile(
    r"\bFY\s*(\d{2,4})|\b(20\d{2})-(\d{2,4})\b|year\s+ended\s+\w+\s+(\d{4})",
    re.IGNORECASE,
)


def _extract_fy(text: str) -> Optional[str]:
    m = _FY_PATTERN.search(text)
    if not m:
        return None
    groups = [g for g in m.groups() if g]
    if not groups:
        return None
    yr = groups[0]
    if len(yr) == 2:
        yr = f"20{yr}"
    return f"FY{yr}"


def _extract_metric(text: str, pattern: re.Pattern) -> Optional[float]:
    m = pattern.search(text)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except (ValueError, AttributeError):
        return None


# ===================================
# Public API
# ===================================

def get_company_trends(company_name: str) -> dict:
    """
    Pull all chunks for a company and extract period-wise metrics.

    Returns:
        {
            "company": "Reliance Industries",
            "periods": ["FY2022", "FY2023", "FY2024"],
            "metrics": {
                "Revenue": {"FY2022": 792756, "FY2023": 878560, "FY2024": 897128},
                "PAT": {...},
                ...
            },
            "documents": [{"document_id": ..., "fy": ..., "chunk_count": ...}]
        }
    """
    collection = get_collection()

    # Query for all chunks belonging to this company
    results = collection.get(
        where={"company_name": company_name},
        include=["documents", "metadatas"],
    )

    if not results or not results.get("ids"):
        return {"company": company_name, "periods": [], "metrics": {}, "documents": []}

    # Group chunks by document_id
    doc_chunks: dict[str, list[str]] = {}
    doc_meta: dict[str, dict] = {}

    for i, doc_id_meta in enumerate(results["metadatas"]):
        doc_id = doc_id_meta.get("document_id", "unknown")
        text = results["documents"][i]
        doc_chunks.setdefault(doc_id, []).append(text)
        if doc_id not in doc_meta:
            doc_meta[doc_id] = doc_id_meta

    # For each document, combine all chunks and extract metrics + FY
    period_data: dict[str, dict] = {}
    doc_summary: list[dict] = []

    for doc_id, chunks in doc_chunks.items():
        combined = " ".join(chunks)
        fy = _extract_fy(combined) or doc_meta[doc_id].get("filing_year", "Unknown")

        metrics: dict[str, Optional[float]] = {}
        for name, pattern in _METRIC_PATTERNS.items():
            metrics[name] = _extract_metric(combined, pattern)

        # Only include if we found at least one metric
        found = {k: v for k, v in metrics.items() if v is not None}
        if found:
            period_data[fy] = found

        doc_summary.append({
            "document_id": doc_id,
            "fy": fy,
            "chunk_count": len(chunks),
            "metrics_found": list(found.keys()),
        })

    if not period_data:
        return {"company": company_name, "periods": [], "metrics": {}, "documents": doc_summary}

    # Restructure: metric -> {fy: value}
    periods = sorted(period_data.keys())
    metric_series: dict[str, dict] = {}
    for metric_name in _METRIC_PATTERNS.keys():
        series = {}
        for fy in periods:
            val = period_data[fy].get(metric_name)
            if val is not None:
                series[fy] = val
        if series:
            metric_series[metric_name] = series

    return {
        "company": company_name,
        "periods": periods,
        "metrics": metric_series,
        "documents": doc_summary,
    }


def get_available_companies() -> list[str]:
    """Return all company names that have at least one document ingested."""
    collection = get_collection()
    results = collection.get(include=["metadatas"])
    names: set[str] = set()
    for meta in results.get("metadatas", []):
        name = meta.get("company_name", "").strip()
        if name:
            names.add(name)
    return sorted(names)
