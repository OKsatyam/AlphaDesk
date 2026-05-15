"""
Fetch API
=========
Endpoints that trigger auto-fetch of financial documents from BSE/NSE/SEC,
then immediately ingest them into the RAG pipeline.

Routes:
    POST /fetch/bse   — fetch annual report from BSE India by company name
    POST /fetch/nse   — fetch annual report from NSE India by company name
    POST /fetch/sec   — fetch 10-K from SEC EDGAR by US ticker

All endpoints return Server-Sent Events (SSE) to keep the TCP connection alive
during the fetch+ingest pipeline (which can take 20-60s on CPU).
Frontend reads progress events, then the final "done" event contains the result JSON.
"""

import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app.core.pipeline import ingest_document
from app.fetchers.bse import (
    fetch_bse_document,
    CompanyNotFoundError as BseCompanyNotFoundError,
    NoReportsFoundError as BseNoReportsFoundError,
    DownloadError as BseDownloadError,
)
from app.fetchers.nse import (
    fetch_nse_document,
    CompanyNotFoundError as NseCompanyNotFoundError,
    NoReportsFoundError as NseNoReportsFoundError,
    DownloadError as NseDownloadError,
    SessionError as NseSessionError,
)
from app.fetchers.sec_edgar import (
    fetch_sec_document,
    CompanyNotFoundError as SecCompanyNotFoundError,
    NoFilingsFoundError as SecNoFilingsFoundError,
    DownloadError as SecDownloadError,
)
from loguru import logger

router = APIRouter(prefix="/fetch", tags=["fetch"])


# ===================================
# Request models
# ===================================

class FetchRequest(BaseModel):
    company_name: str
    year: Optional[int] = None


class SecFetchRequest(BaseModel):
    ticker: str
    year: Optional[int] = None


# ===================================
# SSE helpers
# ===================================

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _heartbeat_stream(work_coro):
    """
    Run `work_coro` in a thread while periodically sending SSE heartbeats
    so the TCP connection stays alive during long CPU-bound processing.
    Returns the coroutine result via the final SSE event.
    """
    result_box: list = []
    error_box:  list = []

    async def runner():
        try:
            result_box.append(await asyncio.to_thread(work_coro))
        except Exception as exc:
            error_box.append(exc)

    task = asyncio.create_task(runner())

    # Send a heartbeat every 3 seconds while working
    while not task.done():
        yield _sse({"type": "progress", "message": "Processing…"})
        await asyncio.sleep(3)

    if error_box:
        yield _sse({"type": "error", "detail": str(error_box[0])})
        return

    yield _sse({"type": "done", "result": result_box[0]})


# ===================================
# BSE fetch endpoint
# ===================================

@router.post("/bse")
async def fetch_from_bse(request: FetchRequest):
    def work():
        if not request.company_name.strip():
            raise ValueError("400:Company name cannot be empty. Enter a name like 'Reliance Industries' or 'TCS'.")
        logger.info(f"BSE fetch: company='{request.company_name}' year={request.year}")
        try:
            fetch_result = fetch_bse_document(
                company_name=request.company_name,
                year=request.year,
            )
        except BseCompanyNotFoundError as e:
            raise ValueError(f"404:{e}")
        except BseNoReportsFoundError as e:
            raise ValueError(f"404:{e}")
        except BseDownloadError as e:
            raise ValueError(f"502:{e}")

        document = ingest_document(
            file_path=fetch_result["file_path"],
            company_name=fetch_result["company_name"],
            filing_type=fetch_result["filing_type"],
            market=fetch_result["market"],
            max_pages=80,
            extract_tables=False,
        )
        return {
            "message": "BSE document fetched and ingested successfully",
            "source": "BSE",
            "bse_code": fetch_result["bse_code"],
            "company_name": fetch_result["company_name"],
            "year": fetch_result["year"],
            "document_id": document.id,
            "filename": document.filename,
            "total_pages": document.total_pages,
            "total_chunks": document.total_chunks,
        }

    return StreamingResponse(
        _heartbeat_stream(work),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ===================================
# NSE fetch endpoint
# ===================================

@router.post("/nse")
async def fetch_from_nse(request: FetchRequest):
    def work():
        if not request.company_name.strip():
            raise ValueError("400:Company name cannot be empty. Enter a name like 'Reliance Industries' or 'RELIANCE'.")
        logger.info(f"NSE fetch: company='{request.company_name}' year={request.year}")
        try:
            fetch_result = fetch_nse_document(
                company_name=request.company_name,
                year=request.year,
            )
        except NseSessionError as e:
            raise ValueError(f"503:{e}")
        except NseCompanyNotFoundError as e:
            raise ValueError(f"404:{e}")
        except NseNoReportsFoundError as e:
            raise ValueError(f"404:{e}")
        except NseDownloadError as e:
            raise ValueError(f"502:{e}")

        document = ingest_document(
            file_path=fetch_result["file_path"],
            company_name=fetch_result["company_name"],
            filing_type=fetch_result["filing_type"],
            market=fetch_result["market"],
            max_pages=80,
            extract_tables=False,
        )
        return {
            "message": "NSE document fetched and ingested successfully",
            "source": "NSE",
            "nse_symbol": fetch_result["nse_symbol"],
            "company_name": fetch_result["company_name"],
            "year": fetch_result["year"],
            "document_id": document.id,
            "filename": document.filename,
            "total_pages": document.total_pages,
            "total_chunks": document.total_chunks,
        }

    return StreamingResponse(
        _heartbeat_stream(work),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ===================================
# SEC EDGAR fetch endpoint
# ===================================

@router.post("/sec")
async def fetch_from_sec(request: SecFetchRequest):
    def work():
        if not request.ticker.strip():
            raise ValueError("400:Ticker cannot be empty. Enter a ticker like 'AAPL', 'MSFT', or 'GOOGL'.")
        logger.info(f"SEC fetch: ticker='{request.ticker}' year={request.year}")
        try:
            fetch_result = fetch_sec_document(
                ticker=request.ticker,
                year=request.year,
            )
        except SecCompanyNotFoundError as e:
            raise ValueError(f"404:{e}")
        except SecNoFilingsFoundError as e:
            raise ValueError(f"404:{e}")
        except SecDownloadError as e:
            raise ValueError(f"502:{e}")

        document = ingest_document(
            file_path=fetch_result["file_path"],
            company_name=fetch_result["company_name"],
            filing_type=fetch_result["filing_type"],
            market=fetch_result["market"],
            max_pages=80,
            extract_tables=False,
        )
        return {
            "message": "SEC document fetched and ingested successfully",
            "source": "SEC EDGAR",
            "ticker": fetch_result["ticker"],
            "cik": fetch_result["cik"],
            "company_name": fetch_result["company_name"],
            "year": fetch_result["year"],
            "document_id": document.id,
            "filename": document.filename,
            "total_pages": document.total_pages,
            "total_chunks": document.total_chunks,
        }

    return StreamingResponse(
        _heartbeat_stream(work),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
