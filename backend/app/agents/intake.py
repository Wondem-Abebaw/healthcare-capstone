"""
Intake Agent — extracts structured patient information from conversation.
Determines symptoms, duration, severity, and fills PatientInfo.
"""

import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.state import HealthcareState
from app.core.config import get_settings
from datetime import datetime, timezone
from tenacity import retry, wait_exponential, stop_after_attempt, before_sleep_log
import json, re, structlog

log = structlog.get_logger()
settings = get_settings()

INTAKE_SYSTEM = """You are a clinical intake AI assistant. Your role is to analyze the patient's reported symptoms and conversation history, then extract structured clinical information.

Extract the following from the conversation:
1. Main symptoms (list each distinctly)
2. Duration of symptoms
3. Severity (mild/moderate/severe)
4. Relevant medical history mentioned
5. Current medications mentioned
6. Allergies mentioned

IMPORTANT: Do NOT diagnose. Only extract and organize reported information.

Respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "symptoms": ["symptom1", "symptom2"],
  "symptom_duration": "X days/weeks",
  "severity": "mild|moderate|severe",
  "medical_history": "any mentioned history or empty string",
  "current_medications": ["med1"],
  "allergies": ["allergy1"],
  "clarification_needed": true/false,
  "clarification_question": "question if needed or null",
  "intake_summary": "2-3 sentence clinical summary of the presentation"
}"""

@retry(
    wait=wait_exponential(multiplier=1, min=10, max=60),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logging.getLogger(__name__), logging.WARNING),
    reraise=True,
)
async def _invoke_llm(llm, messages: list) -> str:
    response = await llm.ainvoke(messages)
    return response.content

async def intake_agent(state: HealthcareState) -> dict:
    """
    Analyzes conversation messages to extract structured patient data.
    """
    start = datetime.now(timezone.utc)
    log.info("agent.intake.start", session_id=state["session_id"])

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=settings.google_api_key,
        temperature=0.1,
    )

    # Build context from messages
    conversation = "\n".join(
        f"{m.type.upper()}: {m.content}"
        for m in state["messages"]
        if hasattr(m, "content")
    )

    patient_context = ""
    pi = state.get("patient_info", {})
    if pi.get("name"):
        patient_context = f"\nPatient: {pi.get('name')}, Age: {pi.get('age')}, Gender: {pi.get('gender')}"

    # ── LLM call with retry ───────────────────────────────────────────────
    try:
        raw = await _invoke_llm(
            llm,
            [
                SystemMessage(content=INTAKE_SYSTEM),
                HumanMessage(
                    content=f"Extract clinical information from this conversation:{patient_context}\n\n{conversation}"
                ),
            ],
        )
    except Exception as exc:
        log.error("agent.intake.llm_failed", exc=str(exc))
        raw = ""


    duration_ms = int(
        (datetime.now(timezone.utc) - start).total_seconds() * 1000
    )

    # Parse JSON
    raw = raw.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        extracted = json.loads(raw)
    except json.JSONDecodeError:
        log.error("agent.intake.parse_error", raw=raw[:200])
        extracted = {
            "symptoms": ["Unable to parse symptoms — please describe again"],
            "symptom_duration": "unknown",
            "severity": "moderate",
            "medical_history": "",
            "current_medications": [],
            "allergies": [],
            "clarification_needed": False,
            "intake_summary": raw[:300],
        }

    log.info("agent.intake.complete", symptoms=extracted.get("symptoms"), duration_ms=duration_ms)

    return {
        "symptoms": extracted.get("symptoms", []),
        "symptom_duration": extracted.get("symptom_duration", "unknown"),
        "severity": extracted.get("severity", "moderate"),
        "patient_info": {
            **state.get("patient_info", {}),
            "medical_history": extracted.get("medical_history", ""),
            "current_medications": extracted.get("current_medications", []),
            "allergies": extracted.get("allergies", []),
        },
        "current_agent": "intake",
        "next_agent": "research",
        "agent_logs": [
            {
                "agent": "Intake Agent",
                "action": "symptom_extraction",
                "content": extracted.get("intake_summary", "Intake complete"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }
