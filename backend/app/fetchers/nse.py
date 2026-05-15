"""
NSE India Auto-Fetcher
======================
Auto-fetches annual reports from the National Stock Exchange (NSE India).

Key difference from BSE:
    NSE requires a live browser session cookie before any API call will work.
    We do a warm-up GET on the NSE homepage first, carry the cookies forward,
    then hit the data APIs. Without this, every request returns 403.

Flow:
    1. _get_nse_session()                 — warm up, get session cookies
    2. search_company_nse(name)           — company name → NSE symbol (ticker)
    3. fetch_annual_reports_list_nse(sym) — symbol → list of PDF links
    4. download_nse_report(url, filename) — download PDF → local file path
    5. fetch_nse_document(name, year)     — orchestrates 1→2→3→4

Usage:
    from app.fetchers.nse import fetch_nse_document

    result = fetch_nse_document("Reliance Industries")
    # result = {
    #     "file_path": "storage/uploads/nse_RELIANCE_2024.pdf",
    #     "company_name": "RELIANCE INDUSTRIES LTD",
    #     "nse_symbol": "RELIANCE",
    #     "year": 2024,
    #     "filing_type": "annual_report",
    #     "market": "IN"
    # }

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
    """Raised when company name does not match any NSE listing."""
    pass


class NoReportsFoundError(Exception):
    """Raised when the company is found but has no annual reports on NSE."""
    pass


class DownloadError(Exception):
    """Raised when the PDF download from NSE fails."""
    pass


class SessionError(Exception):
    """Raised when NSE session/cookie handshake fails."""
    pass


# ===================================
# Constants
# ===================================

NSE_BASE_URL = "https://www.nseindia.com"

# Step 1: warm-up URL — NSE homepage returns 403, but this public page
# passes Akamai bot detection and sets the required 'nsit' session cookie
NSE_HOME_URL = "https://www.nseindia.com/companies-listing/corporate-filings-annual-reports"

# Step 2: search — returns ranked list of companies matching a query string
NSE_SEARCH_URL = "https://www.nseindia.com/api/search?q={query}"

# Step 3: annual reports list — returns PDF links for a given NSE symbol
NSE_ANNUAL_REPORTS_URL = (
    "https://www.nseindia.com/api/annual-reports?index=equities&symbol={symbol}"
)

# NSE requires these headers — without them the API returns 403
NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    # Note: Accept-Encoding is intentionally omitted — httpx handles decompression
    # automatically only when it sets the header itself. Manually setting br (brotli)
    # would require the 'brotli' package and causes decoding errors without it.
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

# Timeout for individual HTTP requests
REQUEST_TIMEOUT = httpx.Timeout(connect=15.0, read=120.0, write=10.0, pool=5.0)
DOWNLOAD_TIMEOUT = httpx.Timeout(connect=15.0, read=180.0, write=10.0, pool=5.0)


# ===================================
# Session management
# ===================================

def _get_nse_session() -> httpx.Client:
    """
    Create an httpx Client with a valid NSE session cookie.

    NSE's API endpoints check for a session cookie set by the homepage.
    Without it, all data API calls return 403 Forbidden.

    Strategy:
        1. Create an httpx Client (which persists cookies automatically).
        2. GET the NSE homepage — this sets 'nsit' and 'nseappid' cookies.
        3. Return the client with cookies baked in for all subsequent calls.

    Returns:
        httpx.Client — pre-authenticated, ready to call NSE APIs.

    Raises:
        SessionError: If the homepage request fails.
    """
    client = httpx.Client(
        headers=NSE_HEADERS,
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
    )

    try:
        logger.info("Warming up NSE session...")
        # First hit the base URL to get initial cookies
        client.get("https://www.nseindia.com")
        # Then hit the filings page to get the nsit cookie
        response = client.get(NSE_HOME_URL)

        if response.status_code not in (200, 304):
            raise SessionError(
                f"NSE warm-up page returned HTTP {response.status_code}. "
                "Cannot establish session."
            )

        # If nsit cookie wasn't set on first try, hit the page once more.
        # NSE's Akamai bot protection sometimes needs two requests to issue nsit.
        if "nsit" not in client.cookies:
            logger.debug("nsit cookie not set yet — retrying warm-up...")
            client.get(NSE_HOME_URL)

        # Switch to JSON API headers for all subsequent data calls
        client.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        })

        logger.debug(f"NSE session ready. Cookies: {list(client.cookies.keys())}")
        return client

    except SessionError:
        raise
    except httpx.HTTPError as exc:
        raise SessionError(
            f"Failed to connect to NSE homepage: {exc}"
        ) from exc


# ===================================
# Step 2: Company search
# ===================================

def _normalize(text: str) -> str:
    """
    Lowercase, strip punctuation and extra spaces for fuzzy matching.

    Example:
        "Reliance Industries Ltd." → "reliance industries ltd"
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def search_company_nse(company_name: str, client: httpx.Client) -> dict:
    """
    Search NSE for a company by name and return its symbol + metadata.

    Uses NSE's autocomplete search API which returns a ranked list of
    matches. We pick the first equity match (type == "EQ").

    Args:
        company_name: Human-readable name, e.g. "Reliance Industries"
        client:       Pre-authenticated httpx.Client from _get_nse_session()

    Returns:
        dict with keys: nse_symbol, company_name

    Raises:
        CompanyNotFoundError: If no matching equity is found.
    """
    logger.info(f"Searching NSE for company: '{company_name}'")

    query = company_name.strip()
    if len(query) < 2:
        raise CompanyNotFoundError(
            f"Search query '{company_name}' is too short. "
            "Use at least 2 characters (e.g. 'Reliance Industries' or 'RELIANCE')."
        )

    url = NSE_SEARCH_URL.format(query=query)

    response = client.get(url)

    if response.status_code != 200:
        raise CompanyNotFoundError(
            f"NSE search API returned HTTP {response.status_code} for '{company_name}'"
        )

    try:
        data = response.json()
    except Exception as exc:
        raise CompanyNotFoundError(
            f"NSE search API returned non-JSON: {exc}"
        ) from exc

    # Response shape: {"results": [...], "timeTook": ..., "totalResults": ...}
    # Each item: {"symbol": "RELIANCE", "symbol_info": "Reliance Industries Limited",
    #             "result_type": "symbol", "result_sub_type": "equity", ...}
    # Guard: NSE sometimes returns a bare list for empty/unusual queries
    if isinstance(data, list):
        all_results = data
    else:
        all_results = data.get("results", [])

    query_norm = _normalize(company_name)

    # --- Pass 1: equity match with EQ series (main spot equity, not derivatives) ---
    # activeSeries contains ["EQ", "T0"] for the main equity listing.
    # Preference shares, rights, etc. have different series codes.
    for item in all_results:
        sub_type = item.get("result_sub_type", "")
        symbol = item.get("symbol", "").strip()
        symbol_info = item.get("symbol_info", "").strip()
        active_series = item.get("activeSeries", [])

        if sub_type == "equity" and symbol and "EQ" in active_series:
            if query_norm in _normalize(symbol_info) or query_norm in _normalize(symbol):
                logger.success(
                    f"Found NSE company: '{symbol_info}' (symbol: {symbol})"
                )
                return {
                    "nse_symbol": symbol.upper(),
                    "company_name": symbol_info.upper(),
                }

    # --- Pass 2: any equity match where name contains query ---
    for item in all_results:
        sub_type = item.get("result_sub_type", "")
        symbol = item.get("symbol", "").strip()
        symbol_info = item.get("symbol_info", "").strip()

        if sub_type == "equity" and symbol:
            if query_norm in _normalize(symbol_info):
                logger.success(
                    f"Found NSE company: '{symbol_info}' (symbol: {symbol})"
                )
                return {
                    "nse_symbol": symbol.upper(),
                    "company_name": symbol_info.upper(),
                }

    # --- Pass 3: take the first equity result as a last resort ---
    for item in all_results:
        if item.get("result_sub_type") == "equity" and item.get("symbol"):
            symbol = item["symbol"].strip().upper()
            symbol_info = item.get("symbol_info", symbol).strip()
            logger.warning(
                f"Using first equity match: '{symbol_info}' (symbol: {symbol})"
            )
            return {
                "nse_symbol": symbol,
                "company_name": symbol_info.upper(),
            }

    raise CompanyNotFoundError(
        f"No NSE equity listing found for '{company_name}'. "
        "Try using the NSE trading symbol directly (e.g. 'RELIANCE', 'TCS', 'INFY')."
    )


# ===================================
# Step 3: Fetch annual reports list
# ===================================

def fetch_annual_reports_list_nse(symbol: str, client: httpx.Client) -> list[dict]:
    """
    Get all annual report filings for an NSE-listed company.

    Args:
        symbol: NSE trading symbol, e.g. "RELIANCE"
        client: Pre-authenticated httpx.Client from _get_nse_session()

    Returns:
        List of dicts, each with: filename, year, url
        Sorted newest-first by year.

    Raises:
        NoReportsFoundError: If no annual reports found for this symbol.
    """
    logger.info(f"Fetching annual reports for NSE symbol: {symbol}")

    url = NSE_ANNUAL_REPORTS_URL.format(symbol=symbol)
    response = client.get(url)

    if response.status_code != 200:
        raise NoReportsFoundError(
            f"NSE annual reports API returned HTTP {response.status_code} "
            f"for symbol '{symbol}'"
        )

    try:
        data = response.json()
    except Exception as exc:
        raise NoReportsFoundError(
            f"NSE API returned non-JSON for symbol {symbol}: {exc}"
        ) from exc

    # Response shape: {"data": [...]}
    # Each item: {"companyName": "...", "fromYr": "2024", "toYr": "2025",
    #             "fileName": "https://nsearchives.nseindia.com/annual_reports/AR_...pdf"}
    filings = data if isinstance(data, list) else data.get("data", [])

    reports = []
    for filing in filings:
        file_url = filing.get("fileName", "").strip()
        if not file_url:
            continue

        # fileName is already a full URL; extract the filename from it
        filename = file_url.split("/")[-1]

        # Skip zip archives — we only handle PDFs
        if not filename.lower().endswith(".pdf"):
            continue

        # Use toYr (end year of fiscal year) as the report year
        raw_year = filing.get("toYr", filing.get("fromYr", ""))
        year = None
        try:
            year = int(raw_year) if raw_year else None
        except (ValueError, TypeError):
            # Fallback: extract year from filename
            years_found = re.findall(r"20[0-2][0-9]", filename)
            year = int(years_found[-1]) if years_found else None

        reports.append({
            "filename": filename,
            "year": year,
            "url": file_url,
        })

    if not reports:
        raise NoReportsFoundError(
            f"No annual reports found for NSE symbol '{symbol}'. "
            "The company may not have filed annual reports on NSE portal."
        )

    # Sort newest first — None years go to the end
    reports.sort(key=lambda r: r["year"] or 0, reverse=True)

    logger.info(f"Found {len(reports)} annual report(s) for {symbol}")
    return reports


# ===================================
# Step 4: Download PDF
# ===================================

def download_nse_report(url: str, filename: str, client: httpx.Client) -> str:
    """
    Download a PDF from NSE archives and save it to the uploads directory.

    Uses the authenticated client (with session cookies) to stream the PDF.
    Skips download if the file is already cached locally.

    Args:
        url:      Full URL to the PDF.
        filename: The NSE filename (used for local save name).
        client:   Pre-authenticated httpx.Client from _get_nse_session()

    Returns:
        Absolute path to the saved PDF file.

    Raises:
        DownloadError: If the download fails.
    """
    safe_filename = "nse_" + re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    local_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    # Skip if already cached
    if os.path.exists(local_path):
        logger.info(f"Using cached file: {local_path}")
        return local_path

    logger.info(f"Downloading: {url}")

    try:
        with client.stream("GET", url, timeout=DOWNLOAD_TIMEOUT) as response:
            if response.status_code != 200:
                raise DownloadError(
                    f"Download failed: HTTP {response.status_code} for {url}"
                )

            content_type = response.headers.get("content-type", "")
            if "html" in content_type:
                raise DownloadError(
                    f"NSE returned an HTML page instead of PDF for {url}. "
                    "The document may have been moved or requires login."
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
# Step 5: Main entry point
# ===================================

def fetch_nse_document(
    company_name: str,
    year: Optional[int] = None
) -> dict:
    """
    Auto-fetch an annual report from NSE India for a given company.

    Orchestrates: session → search → reports list → download

    Args:
        company_name: Company name or NSE symbol, e.g. "Reliance Industries" or "RELIANCE"
        year:         Filing year to fetch (e.g. 2024). If None, fetches the
                      most recent available report.

    Returns:
        dict with these keys (directly usable with ingest_document()):
            file_path     — local path to downloaded PDF
            company_name  — official NSE company name
            nse_symbol    — NSE trading symbol
            year          — fiscal year of the report (int or None)
            filing_type   — always "annual_report"
            market        — always "IN"

    Raises:
        SessionError:         Could not connect to NSE.
        CompanyNotFoundError: Company not found on NSE.
        NoReportsFoundError:  Company found but no annual reports available.
        DownloadError:        PDF download failed.
    """
    # Step 1: establish NSE session (required before any API call)
    client = _get_nse_session()

    try:
        # Step 2: resolve company name → NSE symbol
        company_info = search_company_nse(company_name, client)
        symbol = company_info["nse_symbol"]
        official_name = company_info["company_name"]

        # Step 3: get list of annual reports
        reports = fetch_annual_reports_list_nse(symbol, client)

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
            target_report = reports[0]  # already sorted newest-first

        logger.info(
            f"Selected report: {target_report['filename']} "
            f"(year: {target_report['year']})"
        )

        # Step 4: download the PDF
        local_path = download_nse_report(
            url=target_report["url"],
            filename=target_report["filename"],
            client=client,
        )

    finally:
        # Always close the session, even if an error occurs
        client.close()

    return {
        "file_path": local_path,
        "company_name": official_name,
        "nse_symbol": symbol,
        "year": target_report["year"],
        "filing_type": "annual_report",
        "market": "IN",
    }
