from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from app.db.database import get_db
from app.db.pg_models import User, ChatSession, Message

router = APIRouter(prefix="/chats", tags=["chats"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MessageSchema(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    citations: list = []
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionSchema(BaseModel):
    id: str
    user_email: str
    title: str
    document_id: str
    company_name: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageSchema] = []

    class Config:
        from_attributes = True


class CreateSessionRequest(BaseModel):
    id: Optional[str] = None
    user_email: str
    title: str = "New Chat"
    document_id: str = ""
    company_name: str = ""


class AddMessageRequest(BaseModel):
    id: Optional[str] = None
    user_email: str  # for ownership check
    role: str
    content: str
    citations: list = []


class UpsertSessionRequest(BaseModel):
    """Full session sync — used when syncing localStorage to DB on login."""
    id: str
    user_email: str
    title: str = "New Chat"
    document_id: str = ""
    company_name: str = ""
    messages: list[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _ensure_user(email: str, db: AsyncSession):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(id=email, email=email)
        db.add(user)
        await db.flush()
    return user


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{user_email}", response_model=list[ChatSessionSchema])
async def list_sessions(user_email: str, db: AsyncSession = Depends(get_db)):
    """Return all chat sessions for a user, newest first, with messages."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_email == user_email)
        .options(selectinload(ChatSession.messages))
        .order_by(ChatSession.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ChatSessionSchema, status_code=201)
async def create_session(req: CreateSessionRequest, db: AsyncSession = Depends(get_db)):
    """Create a new chat session."""
    await _ensure_user(req.user_email, db)
    session = ChatSession(
        id=req.id or str(uuid.uuid4()),
        user_email=req.user_email,
        title=req.title,
        document_id=req.document_id,
        company_name=req.company_name,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/sync", status_code=200)
async def sync_sessions(sessions: list[UpsertSessionRequest], db: AsyncSession = Depends(get_db)):
    """
    Bulk upsert — called when a user logs in to push localStorage sessions to DB.
    Skips sessions that already exist.
    """
    for s in sessions:
        await _ensure_user(s.user_email, db)
        existing = await db.get(ChatSession, s.id)
        if existing:
            continue
        session = ChatSession(
            id=s.id,
            user_email=s.user_email,
            title=s.title,
            document_id=s.document_id,
            company_name=s.company_name,
        )
        db.add(session)
        await db.flush()
        for m in s.messages:
            msg = Message(
                id=m.get("id") or str(uuid.uuid4()),
                session_id=s.id,
                role=m["role"],
                content=m["content"],
                citations=m.get("citations", []),
            )
            db.add(msg)
    await db.commit()
    return {"synced": len(sessions)}


@router.get("/{user_email}/{session_id}", response_model=ChatSessionSchema)
async def get_session(user_email: str, session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == session_id, ChatSession.user_email == user_email)
        .options(selectinload(ChatSession.messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/messages", response_model=MessageSchema, status_code=201)
async def add_message(session_id: str, req: AddMessageRequest, db: AsyncSession = Depends(get_db)):
    """Append a message to an existing session."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_email == req.user_email)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg = Message(
        id=req.id or str(uuid.uuid4()),
        session_id=session_id,
        role=req.role,
        content=req.content,
        citations=req.citations,
    )
    db.add(msg)
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return msg


@router.patch("/{user_email}/{session_id}/title")
async def update_title(user_email: str, session_id: str, title: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_email == user_email)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = title
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.put("/{session_id}", response_model=ChatSessionSchema)
async def upsert_session(session_id: str, req: UpsertSessionRequest, db: AsyncSession = Depends(get_db)):
    """
    Full upsert — replace session + all messages.
    Called after every auto-save so DB stays in sync with localStorage.
    """
    await _ensure_user(req.user_email, db)
    existing = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == session_id)
        .options(selectinload(ChatSession.messages))
    )
    session = existing.scalar_one_or_none()

    if session:
        session.title = req.title
        session.document_id = req.document_id
        session.company_name = req.company_name
        session.updated_at = datetime.now(timezone.utc)
        await db.execute(delete(Message).where(Message.session_id == session_id))
    else:
        session = ChatSession(
            id=session_id,
            user_email=req.user_email,
            title=req.title,
            document_id=req.document_id,
            company_name=req.company_name,
        )
        db.add(session)
        await db.flush()

    for m in req.messages:
        msg = Message(
            id=m.get("id") or str(uuid.uuid4()),
            session_id=session_id,
            role=m["role"],
            content=m["content"],
            citations=m.get("citations", []),
        )
        db.add(msg)

    await db.commit()
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id).options(selectinload(ChatSession.messages))
    )
    return result.scalar_one()


@router.delete("/{user_email}/{session_id}", status_code=204)
async def delete_session(user_email: str, session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_email == user_email)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
