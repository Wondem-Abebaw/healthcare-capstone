from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.db import Session as SessionModel, Message, Report, AgentLog
from app.models.schemas import SessionCreate, SessionOut, MessageOut, ReportOut, AgentLogOut
import uuid

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = SessionModel(
        id=str(uuid.uuid4()),
        patient_name=body.patient_name,
        patient_age=body.patient_age,
        patient_gender=body.patient_gender,
        chief_complaint=body.chief_complaint,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


@router.get("", response_model=list[SessionOut])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SessionModel).order_by(desc(SessionModel.created_at)).limit(50)
    )
    return result.scalars().all()


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/messages", response_model=list[MessageOut])
async def get_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()


@router.get("/{session_id}/report", response_model=ReportOut)
async def get_report(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report)
        .where(Report.session_id == session_id)
        .order_by(desc(Report.created_at))
        .limit(1)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{session_id}/agent-logs", response_model=list[AgentLogOut])
async def get_agent_logs(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentLog)
        .where(AgentLog.session_id == session_id)
        .order_by(AgentLog.created_at)
    )
    return result.scalars().all()


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
