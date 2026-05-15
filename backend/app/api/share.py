"""
Share API
=========
POST /share       — save a chat as a read-only JSON file, return share_id
GET  /share/{id}  — return the saved chat JSON (used by frontend share page)
"""

import json
import uuid
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import settings

router = APIRouter(prefix="/share", tags=["share"])

SHARES_DIR = os.path.join(os.path.dirname(settings.UPLOAD_DIR), "shares")
os.makedirs(SHARES_DIR, exist_ok=True)


class ChatMessage(BaseModel):
    role: str
    content: str
    citations: list[dict] = []
    metrics: list[dict] = []


class ShareRequest(BaseModel):
    company_name: str = "Financial Document"
    messages: list[ChatMessage]


@router.post("")
async def create_share(request: ShareRequest):
    """
    Save chat to disk and return a shareable ID.
    The share URL is /share/{share_id} on the frontend.
    """
    share_id = str(uuid.uuid4())[:8]   # short 8-char ID

    payload = {
        "share_id": share_id,
        "company_name": request.company_name,
        "created_at": datetime.utcnow().isoformat(),
        "messages": [m.model_dump() for m in request.messages],
    }

    path = os.path.join(SHARES_DIR, f"{share_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return {"share_id": share_id, "url": f"/share/{share_id}"}


@router.get("/{share_id}")
async def get_share(share_id: str):
    """Return the saved chat for a given share ID."""
    # Sanitise — only allow alphanumeric + hyphen
    if not share_id.replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid share ID")

    path = os.path.join(SHARES_DIR, f"{share_id}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Share not found or expired")

    with open(path, encoding="utf-8") as f:
        return json.load(f)
