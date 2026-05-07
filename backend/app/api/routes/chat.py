"""
Chat route with Server-Sent Events streaming.
Compatible with sse-starlette 3.x and FastAPI 0.135+
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage
from app.core.database import get_db
from app.models.db import Session as SessionModel, Message, Report, AgentLog
from app.models.schemas import ChatRequest
from app.agents.graph import stream_healthcare_pipeline
import uuid, json, asyncio, structlog
from datetime import datetime, timezone

log = structlog.get_logger()
router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Accepts a user message, runs the full multi-agent pipeline,
    streams events as SSE (text/event-stream).

    Event types:
      agent_start  → { type, agent, message }
      agent_log    → { type, agent, action, content }
      complete     → { type, differential_dx, red_flags, report_summary }
      done         → { type }
      error        → { type, message }
    """
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Persist user message immediately
    db.add(Message(
        id=str(uuid.uuid4()),
        session_id=body.session_id,
        role="user",
        content=body.message,
    ))
    await db.commit()

    # Load full conversation history for context
    hist = await db.execute(
        select(Message)
        .where(Message.session_id == body.session_id)
        .order_by(Message.created_at)
    )
    history = hist.scalars().all()

    lc_messages = [
        HumanMessage(content=m.content) if m.role == "user"
        else AIMessage(content=m.content)
        for m in history
    ]

    patient_info = {
        "name":            session.patient_name,
        "age":             session.patient_age,
        "gender":          session.patient_gender,
        "chief_complaint": session.chief_complaint or body.message,
    }

    async def event_generator():
        logs_to_save   = []
        final_state    = {}

        try:
            async for event in stream_healthcare_pipeline(
                session_id=body.session_id,
                messages=lc_messages,
                patient_info=patient_info,
            ):
                etype = event.get("type")

                if etype == "agent_start":
                    yield _sse({"type": "agent_start", "agent": event["agent"], "message": event["message"]})

                elif etype == "agent_log":
                    yield _sse({"type": "agent_log", "agent": event["agent"],
                                "action": event["action"], "content": event["content"]})
                    logs_to_save.append(event)

                elif etype == "complete":
                    final_state = event
                    yield _sse({
                        "type":            "complete",
                        "differential_dx": event.get("differential_dx", []),
                        "red_flags":       event.get("red_flags", []),
                        "report_summary":  event.get("report_summary", ""),
                    })

                await asyncio.sleep(0)   # yield control to event loop

            # ── Persist to DB ─────────────────────────────────────────────
            for al in logs_to_save:
                db.add(AgentLog(
                    id=str(uuid.uuid4()),
                    session_id=body.session_id,
                    agent_name=al.get("agent", "unknown"),
                    action=al.get("action", ""),
                    output_={"content": al.get("content", "")},
                    status="success",
                ))

            if summary := final_state.get("report_summary"):
                db.add(Message(
                    id=str(uuid.uuid4()),
                    session_id=body.session_id,
                    role="assistant",
                    content=summary,
                    agent_name="Report Agent",
                ))

            if fhir := final_state.get("fhir_bundle"):
                db.add(Report(
                    id=str(uuid.uuid4()),
                    session_id=body.session_id,
                    fhir_bundle=fhir,
                    summary=final_state.get("report_summary", ""),
                    differential_dx=final_state.get("differential_dx", []),
                    status="finalized",
                ))

            session.status = "completed"
            await db.commit()

            yield _sse({"type": "done"})

        except Exception as exc:
            log.error("chat.stream.error", exc=str(exc))
            try:
                await db.rollback()
            except Exception:
                pass
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":      "no-cache",
            "X-Accel-Buffering":  "no",
            "Connection":         "keep-alive",
            "Transfer-Encoding":  "chunked",
        },
    )


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
