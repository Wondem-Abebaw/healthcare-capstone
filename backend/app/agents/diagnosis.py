"""
Diagnosis Support Agent — generates differential diagnosis with ICD-10 codes,
confidence scores, reasoning, and recommended workup.
DISCLAIMER: AI-assisted only, not a replacement for clinical judgment.
"""
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.state import HealthcareState, DiagnosisEntry
from app.core.config import get_settings
from tenacity import retry, wait_exponential, stop_after_attempt, before_sleep_log
from datetime import datetime, timezone
import json, re, structlog

log = structlog.get_logger()
settings = get_settings()

DIAGNOSIS_SYSTEM = """You are an AI clinical decision support system. Based on patient symptoms, history, and medical literature, generate a differential diagnosis.

CRITICAL DISCLAIMER: This is an AI-assisted tool for educational and research purposes only. It does NOT replace clinical judgment or constitute medical advice.

Respond ONLY with a valid JSON object:
{
  "differential_diagnosis": [
    {
      "condition": "Condition name",
      "icd10_code": "ICD-10 code (e.g., J18.9)",
      "probability": "High|Moderate|Low",
      "confidence": 0.0-1.0,
      "reasoning": "Clinical reasoning based on symptoms and literature",
      "supporting_evidence": ["evidence point 1", "evidence point 2"],
      "recommended_workup": ["CBC", "chest X-ray", etc.]
    }
  ],
  "red_flags": ["urgent finding 1", "urgent finding 2"],
  "requires_immediate_care": true/false,
  "summary": "3-4 sentence clinical summary of the assessment"
}

List 3-5 diagnoses ordered by likelihood. Be medically accurate."""

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
async def diagnosis_agent(state: HealthcareState) -> dict:
    """
    Generates structured differential diagnosis from symptoms + research context.
    """
    start = datetime.now(timezone.utc)
    log.info("agent.diagnosis.start", session_id=state["session_id"])

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",   # Use Pro for better clinical reasoning
        google_api_key=settings.google_api_key,
        temperature=0.15,
    )

    patient_info = state.get("patient_info", {})
    symptoms = state.get("symptoms", [])
    duration = state.get("symptom_duration", "unknown")
    severity = state.get("severity", "moderate")
    rag_context = state.get("rag_context", "")

    diagnosis_prompt = f"""Patient Information:
- Name: {patient_info.get('name', 'Anonymous')}
- Age: {patient_info.get('age', 'unknown')}
- Gender: {patient_info.get('gender', 'unknown')}
- Chief Complaint: {patient_info.get('chief_complaint', 'Not specified')}

Clinical Presentation:
- Symptoms: {', '.join(symptoms)}
- Duration: {duration}
- Severity: {severity}
- Medical History: {patient_info.get('medical_history', 'None reported')}
- Current Medications: {', '.join(patient_info.get('current_medications', [])) or 'None'}
- Allergies: {', '.join(patient_info.get('allergies', [])) or 'None known'}

Research Synthesis:
{rag_context[:2500]}

Generate a comprehensive differential diagnosis based on all of the above."""

 
    # ── LLM call with retry ───────────────────────────────────────────────
    try:
        raw = await _invoke_llm(
            llm,
            [
                SystemMessage(content=DIAGNOSIS_SYSTEM),
                HumanMessage(content=diagnosis_prompt),
            ],
        )
    except Exception as exc:
        log.error("agent.diagnosis.llm_failed", exc=str(exc))
        # Return a safe fallback so the pipeline continues to the report agent
        return {
            "differential_dx": [
                {
                    "condition":           "Diagnosis unavailable — API rate limit reached",
                    "icd10_code":          "Z00.00",
                    "probability":         "Low",
                    "confidence":          0.0,
                    "reasoning":           "The Gemini API rate limit was reached. Please wait a minute and retry.",
                    "supporting_evidence": [],
                    "recommended_workup":  ["Retry session", "Consult physician"],
                }
            ],
            "red_flags":        [],
            "diagnosis_summary": "Diagnosis could not be generated due to API rate limits.",
            "current_agent":    "diagnosis",
            "next_agent":       "report",
            "agent_logs": [
                {
                    "agent":     "Diagnosis Agent",
                    "action":    "differential_diagnosis",
                    "content":   f"Failed after retries: {str(exc)[:200]}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }
    raw =raw.strip()
    raw = re.sub(r"^```(?:json)?\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.error("agent.diagnosis.parse_error", raw=raw[:200])
        parsed = {
            "differential_diagnosis": [
                {
                    "condition": "Parsing Error — see raw output",
                    "icd10_code": "Z00.00",
                    "probability": "Low",
                    "confidence": 0.0,
                    "reasoning": raw[:400],
                    "supporting_evidence": [],
                    "recommended_workup": ["Consult physician"],
                }
            ],
            "red_flags": [],
            "requires_immediate_care": False,
            "summary": "Diagnosis generation encountered an error.",
        }

    differential_dx: list[DiagnosisEntry] = parsed.get("differential_diagnosis", [])
    red_flags = parsed.get("red_flags", [])
    requires_immediate = parsed.get("requires_immediate_care", False)
    summary = parsed.get("summary", "")

    duration_ms = int(
        (datetime.now(timezone.utc) - start).total_seconds() * 1000
    )
    log.info(
        "agent.diagnosis.complete",
        dx_count=len(differential_dx),
        red_flags=len(red_flags),
        requires_immediate=requires_immediate,
        duration_ms=duration_ms,
    )

    log_content = f"Generated {len(differential_dx)} differential diagnoses."
    if red_flags:
        log_content += f" RED FLAGS: {', '.join(red_flags)}."
    if requires_immediate:
        log_content += " REQUIRES IMMEDIATE CARE."

    return {
        "differential_dx": differential_dx,
        "red_flags": red_flags,
        "diagnosis_summary": summary,
        "current_agent": "diagnosis",
        "next_agent": "report",
        "agent_logs": [
            {
                "agent": "Diagnosis Agent",
                "action": "differential_diagnosis",
                "content": log_content,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }
