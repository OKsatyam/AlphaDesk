"""
Risk Tagger
===========
Pattern-based extraction of risk factors from financial document text.
No external API — pure regex + keyword matching.

Returns structured risk entries with type, severity, and the exact sentence.
"""

import re
from typing import Optional

# ===================================
# Risk taxonomy
# ===================================

RISK_PATTERNS: list[dict] = [
    {
        "type": "Regulatory",
        "color": "#F59E0B",
        "keywords": [
            r"regulat\w+", r"SEBI", r"RBI", r"TRAI", r"compliance", r"policy",
            r"government\s+approval", r"license", r"statutory", r"legal\s+proceeding",
            r"litigation", r"court", r"penalty", r"fine", r"tax\s+\w+",
        ],
    },
    {
        "type": "Market",
        "color": "#EF4444",
        "keywords": [
            r"crude\s+oil", r"commodity\s+price", r"market\s+volatil\w+",
            r"demand\s+slowdown", r"economic\s+downturn", r"recession",
            r"inflation", r"interest\s+rate", r"macroeconomic",
            r"global\s+headwind", r"price\s+pressure", r"margin\s+compress\w+",
        ],
    },
    {
        "type": "Forex",
        "color": "#8B5CF6",
        "keywords": [
            r"foreign\s+exchange", r"forex", r"currency\s+risk", r"USD",
            r"rupee\s+depreciat\w+", r"exchange\s+rate", r"hedg\w+",
            r"dollar\s+\w+", r"currency\s+fluctuat\w+",
        ],
    },
    {
        "type": "Competition",
        "color": "#0EA5E9",
        "keywords": [
            r"competition\w*", r"competitor", r"market\s+share\s+loss",
            r"rival\w*", r"disrupt\w+", r"new\s+entrant", r"pricing\s+pressure",
            r"competitive\s+landscape", r"Adani", r"Amazon", r"Reliance\s+Retail",
        ],
    },
    {
        "type": "Liquidity",
        "color": "#10B981",
        "keywords": [
            r"liquidity\s+risk", r"debt\s+repayment", r"cash\s+flow\s+\w+",
            r"working\s+capital", r"credit\s+facilit\w+", r"loan\s+covenant",
            r"refinanc\w+", r"debt\s+maturit\w+", r"solvency",
        ],
    },
    {
        "type": "ESG",
        "color": "#6B7280",
        "keywords": [
            r"climate\s+\w+", r"carbon\s+emission", r"ESG", r"sustainability",
            r"environmental\s+\w+", r"greenhouse", r"net\s+zero",
            r"social\s+responsib\w+", r"governance\s+\w+",
        ],
    },
    {
        "type": "Cyber",
        "color": "#EC4899",
        "keywords": [
            r"cyber\w*", r"data\s+breach", r"security\s+incident",
            r"ransomware", r"IT\s+risk", r"information\s+security",
            r"data\s+privac\w+", r"GDPR",
        ],
    },
]

# Pre-compile all patterns per risk type
_COMPILED: list[dict] = [
    {
        "type": r["type"],
        "color": r["color"],
        "pattern": re.compile(
            "|".join(r["keywords"]), re.IGNORECASE
        ),
    }
    for r in RISK_PATTERNS
]

# Split text into sentences
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")

# Words that signal a risk sentence
_RISK_SIGNAL = re.compile(
    r"\b(risk|may|might|could|uncertain|adversely|impact|threat|challenge|concern|exposure|vulnerab\w+)\b",
    re.IGNORECASE,
)


# ===================================
# Public API
# ===================================

def tag_risks(text: str) -> list[dict]:
    """
    Extract risk sentences from text and tag them by type.

    Returns:
        [{"type": "Regulatory", "color": "#F59E0B", "sentence": "...", "severity": "high"}, ...]
    """
    sentences = _SENT_SPLIT.split(text)
    seen: set[str] = set()
    results: list[dict] = []

    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 30:
            continue

        # Must contain a risk signal word to be included
        if not _RISK_SIGNAL.search(sentence):
            continue

        for rt in _COMPILED:
            if rt["pattern"].search(sentence):
                # Deduplicate by first 60 chars of sentence
                key = sentence[:60]
                if key in seen:
                    continue
                seen.add(key)

                severity = _score_severity(sentence)
                results.append({
                    "type": rt["type"],
                    "color": rt["color"],
                    "sentence": sentence[:200],
                    "severity": severity,
                })
                break  # one tag per sentence

    # Sort: high → medium → low
    order = {"high": 0, "medium": 1, "low": 2}
    results.sort(key=lambda x: order.get(x["severity"], 1))

    return results[:12]  # cap at 12 risks


def _score_severity(sentence: str) -> str:
    """Heuristic severity based on language strength."""
    high_words = re.compile(
        r"\b(significant|material|severe|substantial|major|critical|serious|adverse|directly\s+impact)\b",
        re.IGNORECASE,
    )
    low_words = re.compile(
        r"\b(minor|limited|minimal|unlikely|remote|manageable)\b",
        re.IGNORECASE,
    )
    if high_words.search(sentence):
        return "high"
    if low_words.search(sentence):
        return "low"
    return "medium"


def tag_risks_from_citations(citations: list[dict]) -> list[dict]:
    """
    Run risk tagging across all citation text snippets.
    Input: list of citation dicts with 'text_snippet' key.
    """
    combined = " ".join(c.get("text_snippet", "") for c in citations)
    return tag_risks(combined)
