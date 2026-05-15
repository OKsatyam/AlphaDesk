from pydantic_settings import BaseSettings
from pathlib import Path

# Base directory of the backend folder
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # ===================================
    # App
    # ===================================
    APP_NAME: str = "AlphaDesk"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # ===================================
    # LLM providers (use whichever you have a key for)
    # ===================================
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    CLAUDE_MAX_TOKENS: int = 4096

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Default provider: "groq" | "gemini" | "claude"
    DEFAULT_LLM_PROVIDER: str = "groq"

    # ===================================
    # Embedding model (runs locally, no key needed)
    # ===================================
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # ===================================
    # ChromaDB
    # ===================================
    CHROMA_DB_PATH: str = str(BASE_DIR / "storage" / "chroma_db")
    CHROMA_COLLECTION_NAME: str = "alphadesk_documents"

    # ===================================
    # Storage
    # ===================================
    UPLOAD_DIR: str = str(BASE_DIR / "storage" / "uploads")
    MAX_UPLOAD_SIZE_MB: int = 50

    # ===================================
    # RAG settings
    # ===================================
    CHUNK_SIZE: int = 400
    CHUNK_OVERLAP: int = 80
    TOP_K_RESULTS: int = 8

    # ===================================
    # Web search fallback (Tavily — free 1000/mo)
    # ===================================
    TAVILY_API_KEY: str = ""  # https://tavily.com — free tier, no card needed

    # ===================================
    # PostgreSQL (optional — set to enable cross-device chat sync)
    # ===================================
    DATABASE_URL: str = ""  # e.g. postgresql+asyncpg://user:pass@host:5432/alphadesk

    class Config:
        env_file = str(BASE_DIR / ".env")
        extra = "ignore"


# Single instance used across entire app
settings = Settings()