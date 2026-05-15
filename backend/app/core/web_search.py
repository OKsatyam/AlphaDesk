"""
Web search fallback for RAG misses.

Chain:
  1. Tavily API (key required, 1000 free/mo) — best results for financial queries
  2. DuckDuckGo Instant Answer (no key, unlimited) — weaker but free safety net
  3. Returns SEARCH_LIMIT_SENTINEL if both fail/exhausted
"""

import httpx
from app.config import settings

SEARCH_LIMIT_SENTINEL = "__SEARCH_LIMIT__"


def _tavily(query: str, num_results: int) -> str | None:
    """
    Returns snippets from Tavily, None on any failure.
    Raises RateLimitError string "__RATE_LIMITED__" when quota hit.
    """
    if not settings.TAVILY_API_KEY:
        return None
    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": num_results,
                    "include_answer": True,
                },
            )
            if r.status_code == 429:
                return "__RATE_LIMITED__"
            if r.status_code == 401:
                print("[web_search] Tavily: invalid API key")
                return None
            r.raise_for_status()
            data = r.json()

        parts: list[str] = []
        if data.get("answer"):
            parts.append(f"Summary: {data['answer']}")
        for result in data.get("results", [])[:num_results]:
            title = result.get("title", "")
            content = result.get("content", "")
            url = result.get("url", "")
            if content:
                parts.append(f"{title}\n{content}\n{url}".strip())
        return "\n\n".join(parts) if parts else None

    except Exception as exc:
        print(f"[web_search] Tavily failed: {exc}")
        return None


def _duckduckgo(query: str, num_results: int) -> str:
    """Returns snippets from DuckDuckGo Instant Answer. Returns '' on failure."""
    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            r = client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_html": "1",
                    "skip_disambig": "1",
                    "no_redirect": "1",
                },
                headers={"User-Agent": "AlphaDesk/1.0 (financial research assistant)"},
            )
            data = r.json()

        parts: list[str] = []
        if data.get("Answer"):
            parts.append(f"Direct answer: {data['Answer']}")
        if data.get("AbstractText"):
            source = data.get("AbstractSource", "Web")
            url = data.get("AbstractURL", "")
            parts.append(f"{data['AbstractText']} (Source: {source})\n{url}".strip())
        for topic in data.get("RelatedTopics", []):
            if not isinstance(topic, dict):
                continue
            text = topic.get("Text", "")
            if text:
                parts.append(text)
            if len(parts) >= num_results:
                break
        return "\n\n".join(parts)

    except Exception as exc:
        print(f"[web_search] DuckDuckGo failed: {exc}")
        return ""


def search_web(query: str, num_results: int = 4) -> str:
    """
    Main entry point. Returns web context string for LLM, or
    SEARCH_LIMIT_SENTINEL if both sources exhausted/failed.

    Caller should check: if result == SEARCH_LIMIT_SENTINEL → emit SSE event.
    """
    # 1. Try Tavily
    tavily_result = _tavily(query, num_results)
    if tavily_result == "__RATE_LIMITED__":
        print("[web_search] Tavily quota exhausted — falling back to DuckDuckGo")
        ddg = _duckduckgo(query, num_results)
        return ddg if ddg else SEARCH_LIMIT_SENTINEL
    if tavily_result:
        return tavily_result

    # 2. Tavily unavailable (no key / error) — try DuckDuckGo
    ddg = _duckduckgo(query, num_results)
    return ddg if ddg else SEARCH_LIMIT_SENTINEL
