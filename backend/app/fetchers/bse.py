"""
BSE India Auto-Fetcher
======================
Auto-fetches annual reports from the Bombay Stock Exchange (BSE India).

Flow:
    1. search_company_bse(name)        — company name → BSE scrip code
    2. fetch_annual_reports_list(code) — scrip code → list of PDF links
    3. download_bse_report(url, name)  — download PDF → local file path
    4. fetch_bse_document(name, year)  — orchestrates 1→2→3, returns ingest-ready dict

Usage:
    from app.fetchers.bse import fetch_bse_document

    result = fetch_bse_document("Reliance Industries")
    # result = {
    #     "file_path": "storage/uploads/bse_500325_2024.pdf",
    #     "company_name": "RELIANCE INDUSTRIES LTD",
    #     "bse_code": "500325",
    #     "year": 2024,
    #     "filing_type": "annual_report",
    #     "market": "IN"
    # }

    # Plug directly into the RAG pipeline:
    from app.core.pipeline import ingest_document
    document = ingest_document(
        file_path=result["file_path"],
        company_name=result["company_name"],
        filing_type=result["filing_type"],
        market=result["market"]
    )
"""

import os
import re
from typing import Optional

import httpx
from loguru import logger

from app.config import settings


# ===================================
# Custom exceptions
# ===================================

class CompanyNotFoundError(Exception):
    """Raised when company name does not match any BSE listing."""
    pass


class NoReportsFoundError(Exception):
    """Raised when the company is found but has no annual reports on BSE."""
    pass


class DownloadError(Exception):
    """Raised when the PDF download from BSE CDN fails."""
    pass


# ===================================
# Constants
# ===================================

# BSE API: returns all active equities as JSON
BSE_SCRIP_LIST_URL = (
    "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w"
    "?Group=&Scripcode=&segment=Equity&Status=Active&industry=&segment=Equity"
)

# BSE API: returns annual report filings for a given scrip code
BSE_ANNUAL_REPORT_URL = (
    "https://api.bseindia.com/BseIndiaAPI/api/AnnualReport/w"
    "?scripcode={bse_code}&Category=Annual%20Report"
)

# BSE CDN: annual report PDFs are archived here (AttachHis, not AttachLive)
BSE_CDN_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachHis/"

# BSE blocks non-browser requests — these headers prevent 403 responses
BSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.bseindia.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.bseindia.com",
}

# Timeout for all HTTP requests
REQUEST_TIMEOUT = httpx.Timeout(connect=15.0, read=90.0, write=10.0, pool=5.0)


# ===================================
# Step 1: Company search
# ===================================

def _normalize(text: str) -> str:
    """
    Lowercase, strip punctuation and extra spaces.
    Used for fuzzy matching company names.

    Example:
        "Reliance Industries Ltd." → "reliance industries ltd"
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)   # remove punctuation
    text = re.sub(r"\s+", " ", text).strip()   # collapse whitespace
    return text


def search_company_bse(company_name: str) -> dict:
    """
    Search BSE for a company by name OR scrip code and return its scrip metadata.

    Accepts:
        - Company name: "Reliance Industries", "HDFC Bank", "TCS"
        - BSE scrip code: "500325", "532454", "500180"

    Strategy (name search):
        - Fetch full active equities list from BSE.
        - Scored substring match against Scrip_Name and Issuer_Name.
        - Falls back to starts-with prefix match.

    Returns:
        dict with keys: bse_code, company_name, isin

    Raises:
        CompanyNotFoundError: If no matching company is found.
        httpx.HTTPError: If the BSE API call fails.
    """
    logger.info(f"Searching BSE for: '{company_name}'")

    raw_input = company_name.strip()
    is_scrip_code = raw_input.isdigit()

    query = _normalize(raw_input)

    if not is_scrip_code and len(query) < 2:
        raise CompanyNotFoundError(
            f"Search query '{company_name}' is too short. "
            "Use at least 2 characters (e.g. 'Reliance Industries') or a scrip code (e.g. '500325')."
        )

    with httpx.Client(headers=BSE_HEADERS, timeout=REQUEST_TIMEOUT) as client:
        response = client.get(BSE_SCRIP_LIST_URL)

    if response.status_code != 200:
        raise httpx.HTTPStatusError(
            f"BSE scrip list returned HTTP {response.status_code}",
            request=response.request,
            response=response
        )

    try:
        data = response.json()
    except Exception as exc:
        raise CompanyNotFoundError(
            f"BSE API returned non-JSON response: {exc}"
        ) from exc

    companies = data if isinstance(data, list) else data.get("Table", [])

    # --- Direct scrip code lookup ---
    if is_scrip_code:
        for company in companies:
            if str(company.get("SCRIP_CD", "")).strip() == raw_input:
                raw_name = company.get("Scrip_Name") or company.get("Issuer_Name", "")
                bse_code = raw_input
                logger.success(f"Scrip code match: '{raw_name}' (BSE code: {bse_code})")
                return {
                    "bse_code": bse_code,
                    "company_name": raw_name.strip().upper(),
                    "isin": company.get("ISIN_NUMBER", ""),
                }
        raise CompanyNotFoundError(
            f"No BSE listing found for scrip code '{raw_input}'. "
            "Verify the code at bseindia.com (e.g. Reliance=500325, TCS=532540)."
        )

    # --- Scored substring match against Scrip_Name and Issuer_Name ---
    # Score = len(query) / len(name) — shorter names that still contain the query win.
    # E.g. "infosys" in "infosys ltd" (0.64) beats "infosys" in "hcl infosystems ltd" (0.37).
    candidates = []
    for company in companies:
        scrip_name = company.get("Scrip_Name", "") or ""
        issuer_name = company.get("Issuer_Name", "") or ""
        # prefer Scrip_Name; fall back to Issuer_Name
        raw_name = scrip_name if scrip_name.strip() else issuer_name
        normalized_name = _normalize(raw_name)
        if query in normalized_name:
            score = len(query) / max(len(normalized_name), 1)
            candidates.append((score, raw_name, company))
        elif issuer_name and scrip_name and query in _normalize(issuer_name):
            # also try issuer name separately if scrip name didn't match
            normalized_issuer = _normalize(issuer_name)
            score = len(query) / max(len(normalized_issuer), 1)
            candidates.append((score, scrip_name or issuer_name, company))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        _, raw_name, best = candidates[0]
        bse_code = str(best.get("SCRIP_CD", "")).strip()
        logger.success(
            f"Found company: '{raw_name}' (BSE code: {bse_code}, "
            f"score: {candidates[0][0]:.2f})"
        )
        return {
            "bse_code": bse_code,
            "company_name": raw_name.strip().upper(),
            "isin": best.get("ISIN_NUMBER", ""),
        }

    # --- Fallback: starts-with prefix match ---
    prefix = query[:6]
    for company in companies:
        raw_name = company.get("Scrip_Name") or company.get("Issuer_Name", "")
        normalized_name = _normalize(raw_name)
        if normalized_name.startswith(prefix):
            bse_code = str(company.get("SCRIP_CD", "")).strip()
            logger.success(f"Prefix match: '{raw_name}' (BSE code: {bse_code})")
            return {
                "bse_code": bse_code,
                "company_name": raw_name.strip().upper(),
                "isin": company.get("ISIN_NUMBER", ""),
            }

    raise CompanyNotFoundError(
        f"No BSE listing found for '{company_name}'. "
        "Try the official company name (e.g. 'Reliance Industries') or scrip code (e.g. '500325')."
    )


# ===================================
# Step 2: Fetch annual report list
# ===================================

def _extract_year(filename: str) -> Optional[int]:
    """
    Extract the filing year from a BSE filename.
    BSE filenames typically contain a 4-digit year somewhere.

    Examples:
        "AR_500325_2024.pdf"   → 2024
        "AnnRep_FY2023_24.pdf" → 2024
        "500325_20240101.pdf"  → 2024
    """
    # Try to find a standalone 4-digit year (2000–2030)
    years = re.findall(r"20[0-2][0-9]", filename)
    if years:
        return int(years[-1])  # take the last (most recent) year found
    return None


def fetch_annual_reports_list(bse_code: str) -> list[dict]:
    """
    Get all annual report filings for a BSE-listed company.

    Args:
        bse_code: 6-digit BSE scrip code, e.g. "500325"

    Returns:
        List of dicts, each with: filename, year, url
        Sorted newest-first by year.

    Raises:
        NoReportsFoundError: If no annual reports exist for this company.
        httpx.HTTPError: If the BSE API call fails.
    """
    logger.info(f"Fetching annual reports for BSE code: {bse_code}")

    url = BSE_ANNUAL_REPORT_URL.format(bse_code=bse_code)

    with httpx.Client(headers=BSE_HEADERS, timeout=REQUEST_TIMEOUT) as client:
        response = client.get(url)

    if response.status_code != 200:
        raise httpx.HTTPStatusError(
            f"BSE annual report API returned HTTP {response.status_code}",
            request=response.request,
            response=response
        )

    try:
        data = response.json()
    except Exception as exc:
        raise NoReportsFoundError(
            f"BSE API returned non-JSON for scrip {bse_code}: {exc}"
        ) from exc

    # Response is a dict with key "Table" containing a list of filing objects.
    # Each item has: year (str), file_name (str), dt_tm (datetime str)
    filings = data if isinstance(data, list) else data.get("Table", [])

    reports = []
    for filing in filings:
        filename = filing.get("file_name", "").strip()
        if not filename:
            continue

        # Only keep PDF files
        if not filename.lower().endswith(".pdf"):
            continue

        # year is a direct field (e.g. "2024"), not embedded in the filename
        raw_year = filing.get("year", "")
        try:
            year = int(raw_year) if raw_year else _extract_year(filename)
        except (ValueError, TypeError):
            year = _extract_year(filename)

        # BSE API sometimes returns double extensions like "file.pdf.pdf" — normalize
        clean_filename = re.sub(r'\.pdf\.pdf$', '.pdf', filename, flags=re.IGNORECASE)
        reports.append({
            "filename": clean_filename,
            "year": year,
            "url": BSE_CDN_BASE + clean_filename,
        })

    if not reports:
        raise NoReportsFoundError(
            f"No annual report PDFs found for BSE code '{bse_code}'. "
            "The company may not have filed annual reports on BSE portal."
        )

    # Sort newest first — None years go to the end
    reports.sort(key=lambda r: r["year"] or 0, reverse=True)

    logger.info(f"Found {len(reports)} annual report(s) for BSE code {bse_code}")
    return reports


# ===================================
# Step 3: Download PDF
# ===================================

def download_bse_report(url: str, filename: str) -> str:
    """
    Download a PDF from BSE CDN and save it to the uploads directory.

    Uses streaming download to handle large PDFs without loading the full
    file into memory.

    Args:
        url:      Full URL to the PDF on BSE CDN.
        filename: The BSE filename (used as the local save name).

    Returns:
        Absolute path to the saved PDF file.

    Raises:
        DownloadError: If the download fails (HTTP error, write error, etc.)
    """
    # Use a safe local filename: prefix with "bse_" to avoid collisions
    safe_filename = "bse_" + re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    local_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    # Skip download if already cached
    if os.path.exists(local_path):
        logger.info(f"Using cached file: {local_path}")
        return local_path

    logger.info(f"Downloading: {url}")

    try:
        with httpx.Client(
            headers=BSE_HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True
        ) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise DownloadError(
                        f"Download failed: HTTP {response.status_code} for {url}"
                    )

                # Verify it's actually a PDF (BSE sometimes returns HTML error pages)
                content_type = response.headers.get("content-type", "")
                if "html" in content_type:
                    raise DownloadError(
                        f"BSE returned an HTML page instead of PDF for {url}. "
                        "The document may have been removed or requires login."
                    )

                os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

                with open(local_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)

    except DownloadError:
        raise
    except httpx.TimeoutException as exc:
        raise DownloadError(
            f"Download timed out for {url}"
        ) from exc
    except httpx.HTTPError as exc:
        raise DownloadError(
            f"Network error while downloading {url}: {exc}"
        ) from exc
    except OSError as exc:
        raise DownloadError(
            f"Failed to write PDF to {local_path}: {exc}"
        ) from exc

    file_size_kb = os.path.getsize(local_path) / 1024
    logger.success(
        f"Downloaded '{safe_filename}' ({file_size_kb:.1f} KB) → {local_path}"
    )
    return local_path


# ===================================
# Step 4: Main entry point
# ===================================

def fetch_bse_document(
    company_name: str,
    year: Optional[int] = None
) -> dict:
    """
    Auto-fetch an annual report from BSE India for a given company.

    This is the main entry point. It orchestrates the full flow:
        1. Search BSE for the company → get BSE scrip code
        2. Get the list of annual reports → find the target year
        3. Download the PDF → save locally

    Args:
        company_name: Company name as known to users, e.g. "Reliance Industries"
        year:         Filing year to fetch (e.g. 2024). If None, fetches the
                      most recent available report.

    Returns:
        dict with these keys (directly usable with ingest_document()):
            file_path     — local path to downloaded PDF
            company_name  — official BSE company name
            bse_code      — 6-digit BSE scrip code
            year          — fiscal year of the report (int or None)
            filing_type   — always "annual_report"
            market        — always "IN"

    Raises:
        CompanyNotFoundError: Company not found on BSE.
        NoReportsFoundError:  Company found but no annual reports available.
        DownloadError:        PDF download failed.
    """
    # Step 1: resolve company name → BSE code
    company_info = search_company_bse(company_name)
    bse_code = company_info["bse_code"]
    official_name = company_info["company_name"]

    # Step 2: get list of annual reports
    reports = fetch_annual_reports_list(bse_code)

    # Pick the correct year — or most recent if year not specified
    if year is not None:
        matching = [r for r in reports if r["year"] == year]
        if not matching:
            available_years = [r["year"] for r in reports if r["year"]]
            raise NoReportsFoundError(
                f"No annual report found for {official_name} in {year}. "
                f"Available years: {available_years}"
            )
        target_report = matching[0]
    else:
        target_report = reports[0]   # already sorted newest-first

    logger.info(
        f"Selected report: {target_report['filename']} "
        f"(year: {target_report['year']})"
    )

    # Step 3: download the PDF
    local_path = download_bse_report(
        url=target_report["url"],
        filename=target_report["filename"]
    )

    return {
        "file_path": local_path,
        "company_name": official_name,
        "bse_code": bse_code,
        "year": target_report["year"],
        "filing_type": "annual_report",
        "market": "IN",
    }
