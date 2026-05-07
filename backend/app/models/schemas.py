from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime


# ── Session ────────────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    patient_name: str | None = None
    patient_age: int | None = None
    patient_gender: str | None = None
    chief_complaint: str | None = None


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    status: str
    patient_name: str | None
    patient_age: int | None
    patient_gender: str | None
    chief_complaint: str | None

    class Config:
        from_attributes = True


# ── Messages ───────────────────────────────────────────────────────────────
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    agent_name: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Chat (SSE trigger) ─────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str


# ── Report ─────────────────────────────────────────────────────────────────
class ReportOut(BaseModel):
    id: str
    session_id: str
    created_at: datetime
    fhir_bundle: dict[str, Any]
    summary: str | None
    differential_dx: list[dict[str, Any]] | None
    minio_key: str | None
    status: str

    class Config:
        from_attributes = True


# ── Document ───────────────────────────────────────────────────────────────
class DocumentOut(BaseModel):
    id: str
    session_id: str | None
    filename: str
    content_type: str
    size_bytes: int | None
    indexed: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Agent Log ──────────────────────────────────────────────────────────────
class AgentLogOut(BaseModel):
    id: str
    agent_name: str
    action: str
    status: str
    duration_ms: int | None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Health ─────────────────────────────────────────────────────────────────
class HealthOut(BaseModel):
    status: str
    version: str
    services: dict[str, str]
