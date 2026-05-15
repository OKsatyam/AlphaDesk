"""
India Number Formatter
======================
Converts raw financial numbers into Indian-style formatted strings.

Indian number system uses crore (1 Cr = 10 million) and lakh (1 L = 100,000).
This is how every Indian financial news channel, BSE filing, and investor
report presents numbers.

Examples:
    897128 crore  →  ₹8.97 L Cr  (lakh crore = trillion)
    58904 crore   →  ₹58,904 Cr
    2340 crore    →  ₹2,340 Cr
    456 crore     →  ₹456 Cr
    12.5 crore    →  ₹12.5 Cr
    0.85 crore    →  ₹85 L  (lakh)
"""

import re
from typing import Optional


# ===================================
# Core formatting
# ===================================

def format_inr_crore(value: float, unit: str = "Cr") -> str:
    """
    Format a number already in crore units into a readable Indian string.

    Args:
        value: The number in crore (e.g. 897128.0)
        unit:  Always "Cr" for crores

    Returns:
        Human-readable string like "₹8.97 L Cr" or "₹58,904 Cr"
    """
    if value >= 1_00_000:  # 1 lakh crore+
        lakh_cr = value / 1_00_000
        return f"₹{lakh_cr:,.2f} L Cr"
    elif value >= 1_000:
        return f"₹{value:,.0f} Cr"
    elif value >= 1:
        return f"₹{value:,.1f} Cr"
    else:
        # sub-crore: convert to lakhs
        lakhs = value * 100
        return f"₹{lakhs:,.1f} L"


def format_inr_absolute(value: float) -> str:
    """
    Format an absolute rupee value (not in crore units) into Indian notation.

    Args:
        value: Absolute rupee value (e.g. 8971280000000)

    Returns:
        "₹8.97 L Cr", "₹58,904 Cr", "₹2,340 L", etc.
    """
    crore = 1_00_00_000   # 10 million
    lakh  = 1_00_000      # 100 thousand

    if value >= crore * 1_00_000:  # >= 1 lakh crore
        lakh_cr = value / (crore * 1_00_000)
        return f"₹{lakh_cr:,.2f} L Cr"
    elif value >= crore:
        cr = value / crore
        return f"₹{cr:,.0f} Cr"
    elif value >= lakh:
        l = value / lakh
        return f"₹{l:,.1f} L"
    else:
        return f"₹{value:,.0f}"


def format_percentage(value: float, decimals: int = 1) -> str:
    """Format a percentage with sign and color hint."""
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.{decimals}f}%"


# ===================================
# Text post-processing
# ===================================

# Matches patterns like "Rs 897128 Cr", "₹897128 crore", "897128 crores"
# Handles: Rs, ₹, INR prefix + number + crore/cr/crores suffix
_CRORE_PATTERN = re.compile(
    r"(?:Rs\.?\s*|₹\s*|INR\s*)?"           # optional currency prefix
    r"([\d,]+(?:\.\d+)?)"                   # number (with optional commas/decimals)
    r"\s*(?:crores?|Cr\.?|cr\.?)",          # crore suffix
    re.IGNORECASE
)

# Matches standalone large numbers that look like crore values in context
_BARE_LARGE_NUMBER = re.compile(
    r"\b([\d,]{6,}(?:\.\d+)?)\b"           # 6+ digit numbers
)


def reformat_numbers_in_text(text: str) -> str:
    """
    Scan an AI-generated answer and reformat raw financial numbers
    into proper Indian notation.

    Example:
        "Revenue was Rs 897128 Cr in FY24"
        → "Revenue was ₹8.97 L Cr in FY24"

        "PAT grew to 79020 crore"
        → "PAT grew to ₹79,020 Cr"
    """
    def replace_crore(match: re.Match) -> str:
        raw = match.group(1).replace(",", "")
        try:
            value = float(raw)
            return format_inr_crore(value)
        except ValueError:
            return match.group(0)

    return _CRORE_PATTERN.sub(replace_crore, text)


# ===================================
# Metric extraction helpers
# ===================================

def extract_financial_figures(text: str) -> list[dict]:
    """
    Extract all financial figures from text and return them with formatted values.
    Useful for building a summary card of key numbers.

    Returns list of dicts: {"raw": "897128 Cr", "formatted": "₹8.97 L Cr", "context": "revenue"}
    """
    figures = []
    for match in _CRORE_PATTERN.finditer(text):
        raw = match.group(1).replace(",", "")
        try:
            value = float(raw)
            formatted = format_inr_crore(value)
            # grab 3 words before for context
            start = max(0, match.start() - 40)
            context_snippet = text[start:match.start()].strip().split()[-3:]
            figures.append({
                "raw": match.group(0),
                "formatted": formatted,
                "context": " ".join(context_snippet),
            })
        except ValueError:
            continue
    return figures
