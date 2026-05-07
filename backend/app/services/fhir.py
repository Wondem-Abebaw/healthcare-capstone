"""
FHIR R4 report builder.
Compatible with fhir.resources 8.2.0 (Pydantic v2 backend).
"""
from fhir.resources.bundle import Bundle, BundleEntry
from fhir.resources.patient import Patient
from fhir.resources.condition import Condition
from fhir.resources.diagnosticreport import DiagnosticReport
from fhir.resources.composition import Composition, CompositionSection
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding
from fhir.resources.reference import Reference
from fhir.resources.humanname import HumanName
from fhir.resources.narrative import Narrative
import uuid
from datetime import datetime, timezone
import structlog

log = structlog.get_logger()


def _cc(text: str, code: str | None = None, system: str | None = None) -> CodeableConcept:
    """Convenience: build CodeableConcept with optional coding."""
    coding = []
    if code and system:
        coding = [Coding.model_validate({"system": system, "code": code, "display": text})]
    return CodeableConcept.model_validate({"text": text, "coding": coding} if coding else {"text": text})


def _narrative(text: str) -> Narrative:
    return Narrative.model_validate({
        "status": "generated",
        "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{text}</div>',
    })


def build_fhir_bundle(
    session_id: str,
    patient_info: dict,
    symptoms: list[str],
    differential_dx: list[dict],
    summary: str,
    research_refs: list[dict] | None = None,
) -> dict:
    """
    Build and return a FHIR R4 Bundle as a plain dict.
    Contains: Patient, Conditions, DiagnosticReport, Composition.
    """
    now_iso     = datetime.now(timezone.utc).isoformat()
    patient_id  = str(uuid.uuid4())
    report_id   = str(uuid.uuid4())
    comp_id     = str(uuid.uuid4())
    entries: list[BundleEntry] = []

    # ── Patient ───────────────────────────────────────────────────────────
    patient_data: dict = {
        "id":     patient_id,
        "name":   [{"text": patient_info.get("name") or "Anonymous Patient"}],
        "gender": patient_info.get("gender") or "unknown",
    }
    if age := patient_info.get("age"):
        patient_data["extension"] = [{
            "url": "http://hl7.org/fhir/StructureDefinition/patient-age",
            "valueInteger": int(age),
        }]
    entries.append(BundleEntry.model_validate({
        "fullUrl":  f"urn:uuid:{patient_id}",
        "resource": Patient.model_validate(patient_data),
    }))

    # ── Conditions (symptoms) ─────────────────────────────────────────────
    for symptom in symptoms:
        cid = str(uuid.uuid4())
        entries.append(BundleEntry.model_validate({
            "fullUrl": f"urn:uuid:{cid}",
            "resource": Condition.model_validate({
                "id":      cid,
                "subject": {"reference": f"urn:uuid:{patient_id}"},
                "code": {
                    "text": symptom,
                    "coding": [{"system": "http://snomed.info/sct", "display": symptom}],
                },
                "clinicalStatus": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active", "display": "Active",
                    }]
                },
                "recordedDate": now_iso,
            }),
        }))

    # ── DiagnosticReport ──────────────────────────────────────────────────
    conclusions = "; ".join(
        f"{dx.get('condition', '')} ({dx.get('probability', '')})"
        for dx in differential_dx[:5]
    )
    entries.append(BundleEntry.model_validate({
        "fullUrl": f"urn:uuid:{report_id}",
        "resource": DiagnosticReport.model_validate({
            "id":     report_id,
            "status": "preliminary",
            "code": {
                "text": "AI-Assisted Differential Diagnosis",
                "coding": [{"system": "http://loinc.org", "code": "11506-3", "display": "Progress note"}],
            },
            "subject":           {"reference": f"urn:uuid:{patient_id}"},
            "effectiveDateTime": now_iso,
            "issued":            now_iso,
            "conclusion":        conclusions,
            "conclusionCode": [
                {
                    "text": dx.get("condition", ""),
                    "coding": [{"system": "http://snomed.info/sct", "display": dx.get("condition", "")}],
                }
                for dx in differential_dx[:5]
            ],
        }),
    }))

    # ── Composition ───────────────────────────────────────────────────────
    dx_text = "\n".join(
        f"- {dx.get('condition')}: {dx.get('probability')} — {dx.get('reasoning', '')}"
        for dx in differential_dx
    )
    ref_text = ""
    if research_refs:
        ref_text = "\n".join(
            f"- {r.get('title')} (PMID: {r.get('pmid')}, {r.get('year')})"
            for r in research_refs[:5]
        )

    sections = [
        {"title": "Clinical Summary",        "text": _narrative(summary)},
        {"title": "Differential Diagnosis",  "text": _narrative(f"<pre>{dx_text}</pre>")},
    ]
    if ref_text:
        sections.append({"title": "Supporting Literature", "text": _narrative(f"<pre>{ref_text}</pre>")})
    sections.append({"title": "Disclaimer", "text": _narrative(
        "This report is AI-generated for educational and research purposes only. "
        "It does NOT constitute medical advice, diagnosis, or treatment. "
        "Always consult a qualified healthcare professional."
    )})

    entries.append(BundleEntry.model_validate({
        "fullUrl": f"urn:uuid:{comp_id}",
        "resource": Composition.model_validate({
            "id":     comp_id,
            "status": "preliminary",
            "type": {
                "coding": [{"system": "http://loinc.org", "code": "34133-9", "display": "Summarization of episode note"}]
            },
            "subject": {"reference": f"urn:uuid:{patient_id}"},
            "date":    now_iso,
            "author":  [{"display": "Healthcare AI System (AI-Assisted — Not a Medical Diagnosis)"}],
            "title":   "AI-Assisted Clinical Assessment Report",
            "section": sections,
        }),
    }))

    # ── Bundle ────────────────────────────────────────────────────────────
    bundle = Bundle.model_validate({
        "id":        str(uuid.uuid4()),
        "type":      "document",
        "timestamp": now_iso,
        "entry":     entries,
    })

    return bundle.model_dump(mode="json", exclude_none=True)
