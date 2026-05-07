"""
Report Agent — generates FHIR R4 bundle and stores it in MinIO.
"""
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.state import HealthcareState
from app.services.fhir import build_fhir_bundle
from app.services.storage import upload_file
from app.core.config import get_settings
from tenacity import retry, wait_exponential, stop_after_attempt, before_sleep_log
from datetime import datetime, timezone
import json, structlog

log = structlog.get_logger()
settings = get_settings()

REPORT_SYSTEM = """You are a clinical report writing AI. Generate a comprehensive, professional clinical assessment report.

The report should include:
1. Executive Summary (2-3 sentences)
2. Clinical Presentation overview
3. Key Findings from medical literature
4. Assessment and Differential Diagnosis summary
5. Recommended Next Steps
6. Mandatory disclaimer about AI limitations

Write in professional clinical language. Be thorough but concise."""

# ── Retry decorator — handles Gemini free tier rate limits ────────────────
@retry(
    wait=wait_exponential(multiplier=1, min=10, max=60),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logging.getLogger(__name__), logging.WARNING),
    reraise=True,
)
async def _invoke_llm(llm, messages: list) -> str:
    """Call the LLM with automatic retry on rate limit errors."""
    response = await llm.ainvoke(messages)
    return response.content


async def report_agent(state: HealthcareState) -> dict:
    """
    Generates FHIR bundle and narrative report, stores both in MinIO.
    """
    start = datetime.now(timezone.utc)
    log.info("agent.report.start", session_id=state["session_id"])

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=settings.google_api_key,
        temperature=0.2,
    )

    patient_info = state.get("patient_info", {})
    symptoms = state.get("symptoms", [])
    differential_dx = state.get("differential_dx", [])
    red_flags = state.get("red_flags", [])
    research_results = state.get("research_results", [])
    diagnosis_summary = state.get("diagnosis_summary", "")

    # Generate narrative report
    report_prompt = f"""Generate a clinical assessment report for:

Patient: {patient_info.get('name', 'Anonymous')}, Age {patient_info.get('age', 'unknown')}, {patient_info.get('gender', 'unknown')}
Chief Complaint: {patient_info.get('chief_complaint', 'Not specified')}
Symptoms: {', '.join(symptoms)}
Duration: {state.get('symptom_duration', 'unknown')}
Severity: {state.get('severity', 'moderate')}

Diagnosis Summary: {diagnosis_summary}

Differential Diagnoses:
{json.dumps(differential_dx[:5], indent=2)}

Red Flags: {', '.join(red_flags) if red_flags else 'None identified'}

Literature reviewed: {len(research_results)} PubMed articles"""
    try:
        narrative = await _invoke_llm(
            llm,
            [
                SystemMessage(content=REPORT_SYSTEM),
                HumanMessage(content=report_prompt),
            ],
        )
    except Exception as exc:
        log.error("agent.report.llm_failed", exc=str(exc))
        narrative = (
            "Report generation failed due to API rate limits. "
            "Please retry the session in a few minutes."
        )

    # Build FHIR R4 bundle
    fhir_bundle = build_fhir_bundle(
        session_id=state["session_id"],
        patient_info=patient_info,
        symptoms=symptoms,
        differential_dx=differential_dx,
        summary=narrative,
        research_refs=research_results[:5],
    )

    # Store FHIR JSON in MinIO
    minio_key = f"sessions/{state['session_id']}/fhir_report.json"
    try:
        await upload_file(
            bucket=settings.minio_reports_bucket,
            key=minio_key,
            data=json.dumps(fhir_bundle, indent=2).encode(),
            content_type="application/fhir+json",
            metadata={"session_id": state["session_id"]},
        )
    except Exception as exc:
        log.warning("agent.report.minio_upload_failed", exc=str(exc))
        minio_key = None

    duration_ms = int(
        (datetime.now(timezone.utc) - start).total_seconds() * 1000
    )
    log.info("agent.report.complete", minio_key=minio_key, duration_ms=duration_ms)

    return {
        "fhir_bundle": fhir_bundle,
        "report_summary": narrative,
        "current_agent": "report",
        "next_agent": "end",
        "agent_logs": [
            {
                "agent": "Report Agent",
                "action": "fhir_generation",
                "content": "Generated FHIR R4 compliant clinical bundle.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            {
                "agent": "Report Agent",
                "action": "storage",
                "content": f"Report stored in MinIO: {minio_key or 'storage unavailable'}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        ],
    }
