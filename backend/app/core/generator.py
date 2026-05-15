"""
Multi-provider LLM generator
=============================
Supports Groq (free), Google Gemini (free), and Anthropic Claude (paid).
Provider is chosen per-request via the `provider` param, falling back to
DEFAULT_LLM_PROVIDER from config.

Usage:
    for token in generate_answer_stream(question, citations, provider="groq"):
        yield token
"""

from typing import Iterator, Optional
from app.models.document import Citation, QueryResponse
from app.config import settings
from app.prompts.hinglish import get_system_prompt, build_rag_prompt, build_web_prompt, build_general_prompt, build_combined_prompt


# ===================================
# Available models manifest
# ===================================

MODELS = {
    "groq": [
        {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B",  "badge": "Free · Fast"},
        {"id": "llama-3.1-8b-instant",     "label": "Llama 3.1 8B",   "badge": "Free · Fastest"},
        {"id": "gemma2-9b-it",             "label": "Gemma 2 9B",     "badge": "Free"},
    ],
    "gemini": [
        {"id": "gemini-flash-latest",      "label": "Gemini Flash",       "badge": "Free · Fast"},
        {"id": "gemini-2.5-flash",         "label": "Gemini 2.5 Flash",   "badge": "Free · Smart"},
    ],
    "claude": [
        {"id": "claude-haiku-4-5-20251001","label": "Claude Haiku",   "badge": "Paid · Fast"},
        {"id": "claude-sonnet-4-6",        "label": "Claude Sonnet",  "badge": "Paid · Best"},
    ],
}


# ===================================
# Context builder (shared)
# ===================================

MAX_CONTEXT_CHARS = 10000  # ~2500 tokens — uses more of the 200K context window


def _build_context(citations: list[Citation]) -> str:
    seen_chunks: set[str] = set()
    block = ""
    # sort by (doc, page) — natural document order + deterministic = stable cache prefix
    for i, c in enumerate(sorted(citations, key=lambda c: (c.document_id, c.page_number)), 1):
        if c.chunk_id in seen_chunks:
            continue
        seen_chunks.add(c.chunk_id)

        entry = (
            f"\nSOURCE {i}:\n"
            f"Section: {c.section}\nPage: {c.page_number}\n"
            f"Relevance: {c.relevance_score:.2f}\nContent: {c.text_snippet}\n---"
        )
        if len(block) + len(entry) > MAX_CONTEXT_CHARS:
            break
        block += entry
    return block


# ===================================
# Provider implementations
# ===================================

def _stream_groq(prompt: str, system: str, model: str) -> Iterator[str]:
    from groq import Groq
    client = Groq(api_key=settings.GROQ_API_KEY)
    stream = client.chat.completions.create(
        model=model or settings.GROQ_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=2048,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def _stream_gemini(prompt: str, system: str, model: str) -> Iterator[str]:
    import google.generativeai as genai
    from google.generativeai.types import BlockedPromptException, StopCandidateException

    # key format check — Gemini keys always start with AIza
    if not settings.GEMINI_API_KEY.startswith("AIza"):
        yield "[Gemini error] Invalid API key format — Gemini keys start with 'AIza'. Check GEMINI_API_KEY in backend/.env"
        return

    genai.configure(api_key=settings.GEMINI_API_KEY)
    full_prompt = f"{system}\n\n{prompt}"

    try:
        response = genai.GenerativeModel(model or settings.GEMINI_MODEL).generate_content(
            full_prompt,
            generation_config={"temperature": 0.1, "max_output_tokens": 2048},
            stream=True,
        )
        yielded_any = False
        for chunk in response:
            # safety block — finish_reason == SAFETY yields empty chunk.text
            if not chunk.text:
                try:
                    finish = chunk.candidates[0].finish_reason if chunk.candidates else None
                    if finish and finish.name == "SAFETY":
                        yield "[Gemini] Response blocked by safety filter. Try rephrasing or switch to Groq."
                        return
                except Exception:
                    pass
                continue
            yielded_any = True
            yield chunk.text

        if not yielded_any:
            yield "[Gemini] Empty response — query may have been filtered. Try rephrasing or switch to Groq."

    except BlockedPromptException:
        yield "[Gemini] Prompt blocked by safety filter. Try rephrasing or switch to Groq."
    except StopCandidateException:
        yield "[Gemini] Response stopped by safety filter. Try rephrasing or switch to Groq."


_THINKING_MODELS = ("sonnet", "opus")  # haiku does not support thinking


def _stream_claude(question: str, context: str, system: str, model: str, language: str = "en") -> Iterator[str]:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    model_id = model or settings.CLAUDE_MODEL
    use_thinking = any(name in model_id for name in _THINKING_MODELS)

    instruction = (
        "Numbers aur facts pe focus karo. Indian number notation use karo (Cr, L Cr). Comprehensive jawab do."
        if language == "hi"
        else "Focus on numbers and facts. Use Indian number notation (Cr, L Cr). Be comprehensive."
    )

    create_kwargs: dict = dict(
        model=model_id,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": f"EXCERPTS:\n{context}\n\n", "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": f"QUESTION: {question}\n\n{instruction}"},
            ],
        }],
    )

    if use_thinking:
        create_kwargs["thinking"] = {"type": "adaptive"}

    with client.messages.stream(**create_kwargs) as stream:
        for text in stream.text_stream:
            if text:
                yield text

        # log cache efficiency after stream — critical for tuning
        usage = stream.get_final_message().usage
        cache_read = getattr(usage, "cache_read_input_tokens", 0)
        cache_write = getattr(usage, "cache_creation_input_tokens", 0)
        print(
            f"[Claude/{model_id}] "
            f"in={usage.input_tokens} out={usage.output_tokens} "
            f"cache_write={cache_write} cache_read={cache_read} "
            f"thinking={'on' if use_thinking else 'off'}"
        )


# ===================================
# Public streaming API
# ===================================

def generate_answer_stream(
    question: str,
    citations: list[Citation],
    language: str = "en",
    provider: Optional[str] = None,
    model: Optional[str] = None,
    web_context: str = "",
) -> Iterator[str]:
    """
    Stream answer tokens from the chosen provider.

    Three modes:
    - citations present          → RAG mode (answer from document)
    - citations empty + web_context → web mode (answer from internet snippets)
    - citations empty, no web_context → general mode (answer from LLM knowledge)

    provider: "groq" | "gemini" | "claude" (defaults to DEFAULT_LLM_PROVIDER)
    model: specific model ID within the provider (optional)
    """
    provider = (provider or settings.DEFAULT_LLM_PROVIDER).lower()
    system = get_system_prompt(language)

    # Build prompt based on mode
    if citations and web_context:
        # Combined: both RAG chunks + live web results
        doc_context = _build_context(citations)
        prompt = build_combined_prompt(question, doc_context, web_context, language)
        claude_context = doc_context + "\n\nWEB DATA:\n" + web_context
    elif citations:
        context = _build_context(citations)
        prompt = build_rag_prompt(question, context, language)
        claude_context = context
    elif web_context:
        prompt = build_web_prompt(question, web_context)
        claude_context = web_context
    else:
        prompt = build_general_prompt(question)
        claude_context = ""

    try:
        if provider == "groq":
            if not settings.GROQ_API_KEY:
                yield "Groq API key not configured. Add GROQ_API_KEY to backend/.env"
                return
            yield from _stream_groq(prompt, system, model or settings.GROQ_MODEL)

        elif provider == "gemini":
            if not settings.GEMINI_API_KEY:
                yield "Gemini API key not configured. Get a free key at aistudio.google.com and add GEMINI_API_KEY to backend/.env"
                return
            if not settings.GEMINI_API_KEY.startswith("AIza"):
                yield "Gemini API key invalid format — must start with 'AIza'. Check GEMINI_API_KEY in backend/.env"
                return
            yield from _stream_gemini(prompt, system, model or settings.GEMINI_MODEL)

        elif provider == "claude":
            if not settings.ANTHROPIC_API_KEY:
                yield "Anthropic API key not configured. Add ANTHROPIC_API_KEY to backend/.env"
                return
            yield from _stream_claude(question, claude_context or prompt, system, model or settings.CLAUDE_MODEL, language)

        else:
            yield f"Unknown provider '{provider}'. Use: groq, gemini, or claude."

    except Exception as e:
        err = str(e)
        err_lower = err.lower()
        label = provider.upper()

        if "resource_exhausted" in err_lower or "quota" in err_lower or "429" in err:
            if provider == "gemini":
                yield (
                    f"[{label}] Rate limit hit — Gemini free tier: 15 req/min, 1,500 req/day. "
                    "Wait 1 minute and retry, or switch to Groq (unlimited free)."
                )
            else:
                yield f"[{label}] Rate limit hit — wait a moment and try again."
        elif "user_location_not_supported" in err_lower or "not supported in your region" in err_lower:
            yield (
                f"[{label}] Gemini not available in your region. "
                "Switch to Groq (works globally) in the model selector."
            )
        elif "credit" in err_lower or "billing" in err_lower:
            yield f"[{label}] No credits — switch to a free provider (Groq or Gemini)."
        elif "api_key" in err_lower or "authentication" in err_lower or "api key not valid" in err_lower:
            yield f"[{label}] Invalid API key — check backend/.env"
        elif "rate" in err_lower:
            yield f"[{label}] Rate limit hit — wait a moment and try again."
        else:
            yield f"[{label}] {err[:150]}"


# ===================================
# Non-streaming (used by /query)
# ===================================

def generate_answer(
    question: str,
    citations: list[Citation],
    language: str = "en",
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> QueryResponse:
    if not citations:
        return QueryResponse(
            question=question,
            answer="I could not find relevant information in the uploaded documents.",
            citations=[],
            document_ids_used=[],
            language=language,
        )

    answer_text = "".join(generate_answer_stream(question, citations, language, provider, model))
    return QueryResponse(
        question=question,
        answer=answer_text,
        citations=citations,
        document_ids_used=list({c.document_id for c in citations}),
        language=language,
    )
