from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from fastapi import HTTPException
from app.config import settings

engine = None
AsyncSessionLocal = None


def init_db():
    """Initialize async engine. Called at startup if DATABASE_URL is set."""
    global engine, AsyncSessionLocal
    engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    if AsyncSessionLocal is None:
        raise HTTPException(
            status_code=503,
            detail="Chat sync unavailable — DATABASE_URL not configured. Chats are saved locally."
        )
    async with AsyncSessionLocal() as session:
        yield session
