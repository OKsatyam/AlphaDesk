"""
Web search fallback via DuckDuckGo Instant Answer API.
Used when RAG retrieval returns 0 relevant chunks.
No API key required.
"""

import httpx


def search_web(query: str, num_results: int = 4) -> str:
    """
    Returns text snippets from DuckDuckGo for use as LLM context.
    Returns "" on failure (network error, no results, etc.).
    """
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
                headers={"User-Agent": "FolioAI/1.0 (financial research assistant)"},
            )
            data = r.json()

        parts: list[str] = []

        if data.get("Answer"):
            parts.append(f"Direct answer: {data['Answer']}")

        if data.get("AbstractText"):
            source_url = data.get("AbstractURL", "")
            source_label = f" (Source: {data.get('AbstractSource', 'Web')})" if data.get("AbstractSource") else ""
            parts.append(f"{data['AbstractText']}{source_label}\n{source_url}".strip())

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
        print(f"[web_search] Failed: {exc}")
        return ""
