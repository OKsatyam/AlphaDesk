from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


# ===================================
# Document — represents an uploaded/fetched file
# ===================================
class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    company_name: str = ""
    filing_type: str = ""        # annual_report, 10-K, earnings_transcript
    market: str = ""             # IN (India) or US
    year: Optional[int] = None
    total_pages: int = 0
    total_chunks: int = 0
    created_at: datetime = Field(default_factory=datetime.now)


# ===================================
# Chunk — one piece of a document stored in ChromaDB
# ===================================
class Chunk(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    text: str
    page_number: int = 0
    section: str = ""            # e.g. "Risk Factors", "MD&A"
    chunk_index: int = 0


# ===================================
# Query models — request and response shape
# ===================================
class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_id: Optional[str] = None
    company_name: Optional[str] = None  # used to scope web search queries
    top_k: int = Field(default=5, ge=1, le=20)
    language: str = "en"               # en | hi
    provider: Optional[str] = None     # groq | gemini | claude (overrides DEFAULT_LLM_PROVIDER)
    model: Optional[str] = None        # specific model ID within provider
    use_web: bool = False              # force web search even when RAG has results


class Citation(BaseModel):
    chunk_id: str
    document_id: str
    page_number: int
    section: str
    relevance_score: float
    text_snippet: str


class QueryResponse(BaseModel):
    question: str
    answer: str
    citations: list[Citation]
    document_ids_used: list[str]
    language: str = "en"