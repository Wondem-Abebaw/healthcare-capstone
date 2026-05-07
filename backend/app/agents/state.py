"""
Shared LangGraph state for the Healthcare Multi-Agent system.
Compatible with LangGraph 1.x (Pydantic v2 backend).
"""
from typing import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage
import operator


class PatientInfo(TypedDict, total=False):
    name:               str
    age:                int
    gender:             str
    chief_complaint:    str
    medical_history:    str
    current_medications: list[str]
    allergies:          list[str]


class ResearchResult(TypedDict):
    pmid:            str
    title:           str
    abstract:        str
    journal:         str
    year:            str
    url:             str
    relevance_score: float


class DiagnosisEntry(TypedDict):
    condition:           str
    icd10_code:          str
    probability:         str        # "High" | "Moderate" | "Low"
    confidence:          float      # 0.0–1.0
    reasoning:           str
    supporting_evidence: list[str]
    recommended_workup:  list[str]


class AgentLog(TypedDict):
    agent:     str
    action:    str
    content:   str
    timestamp: str


class HealthcareState(TypedDict):
    # Core
    session_id: str
    messages:   Annotated[list[BaseMessage], operator.add]

    # Patient data (populated by intake agent)
    patient_info:     PatientInfo
    symptoms:         list[str]
    symptom_duration: str
    severity:         str           # mild | moderate | severe

    # Research (populated by research agent)
    research_results: list[ResearchResult]
    rag_context:      str

    # Diagnosis (populated by diagnosis agent)
    differential_dx:  list[DiagnosisEntry]
    red_flags:        list[str]
    diagnosis_summary: str

    # Report (populated by report agent)
    fhir_bundle:    dict
    report_summary: str

    # Orchestration
    current_agent:   str
    next_agent:      Literal["intake", "research", "diagnosis", "report", "end", "__end__"]
    iteration_count: int
    error:           str | None

    # Append-only log visible in frontend
    agent_logs: Annotated[list[AgentLog], operator.add]
