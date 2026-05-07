"""
Research Agent — searches PubMed + Qdrant vector store for medical evidence.
Combines live PubMed API results with any indexed documents in the vector store.
"""
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.state import HealthcareState, ResearchResult
from app.services.pubmed import search_pubmed
from app.core.vector_store import similarity_search
from app.core.config import get_settings
from tenacity import retry, wait_exponential, stop_after_attempt, before_sleep_log
from datetime import datetime, timezone
import asyncio, structlog, logging

log = structlog.get_logger()
settings = get_settings()

RESEARCH_SYSTEM = """You are a medical research AI assistant. Given a list of symptoms and clinical context, identify the most relevant medical literature and synthesize key findings.

Your output should:
1. Identify likely diagnostic categories to search
2. Highlight evidence-based findings relevant to the presentation
3. Note any red flags or urgency indicators from the literature
4. Stay factual — cite only what the literature says

Format your synthesis clearly. This will be used by the diagnosis agent."""


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


async def research_agent(state: HealthcareState) -> dict:
    """
    Performs parallel PubMed + vector store searches, then synthesizes findings.
    """
    start = datetime.now(timezone.utc)
    log.info("agent.research.start", session_id=state["session_id"])

    symptoms     = state.get("symptoms", [])
    patient_info = state.get("patient_info", {})
    severity     = state.get("severity", "moderate")

    if not symptoms:
        return {
            "research_results": [],
            "rag_context": "No symptoms provided for research.",
            "current_agent": "research",
            "next_agent": "diagnosis",
            "agent_logs": [
                {
                    "agent":     "Research Agent",
                    "action":    "skip",
                    "content":   "No symptoms to research.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }

    # ── Build search queries ──────────────────────────────────────────────
    primary_query = " ".join(symptoms[:4])
    if patient_info.get("age"):
        primary_query += f" patient age {patient_info['age']}"

    symptom_combo = " AND ".join(f'"{s}"' for s in symptoms[:3])
    queries = [
        f"{primary_query} diagnosis",
        f"{symptom_combo} differential diagnosis",
        f"{primary_query} treatment guidelines",
    ]

    # ── Parallel searches: PubMed + Qdrant ───────────────────────────────
    pubmed_tasks = [search_pubmed(q, max_results=4) for q in queries]
    qdrant_task  = similarity_search(
        query=primary_query,
        top_k=5,
        score_threshold=0.45,
    )

    all_pubmed_results, qdrant_results = await asyncio.gather(
        asyncio.gather(*pubmed_tasks),
        qdrant_task,
    )

    # ── Deduplicate PubMed results by PMID ───────────────────────────────
    seen_pmids     = set()
    pubmed_articles = []
    for batch in all_pubmed_results:
        for article in batch:
            pmid = article.get("pmid")
            if pmid and pmid not in seen_pmids:
                seen_pmids.add(pmid)
                pubmed_articles.append(article)

    # ── Format research results ───────────────────────────────────────────
    research_results: list[ResearchResult] = [
        ResearchResult(
            pmid=a["pmid"],
            title=a["title"],
            abstract=a["abstract"][:600],
            journal=a["journal"],
            year=a["year"],
            url=a["url"],
            relevance_score=0.8,
        )
        for a in pubmed_articles[:8]
    ]

    # ── Build RAG context string for diagnosis agent ──────────────────────
    context_parts = ["=== PubMed Literature ==="]
    for r in research_results[:5]:
        context_parts.append(
            f"\n[{r['journal']} {r['year']}] {r['title']}\n{r['abstract']}"
        )

    if qdrant_results:
        context_parts.append("\n=== Indexed Medical Documents ===")
        for doc in qdrant_results[:3]:
            meta   = doc.get("metadata", {})
            source = meta.get("source", "uploaded document")
            context_parts.append(f"\n[{source}] {doc['text'][:400]}")

    rag_context = "\n".join(context_parts)

    # ── Synthesize with LLM (with retry) ─────────────────────────────────
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=settings.google_api_key,
        temperature=0.2,
    )

    synthesis_prompt = f"""Symptoms: {', '.join(symptoms)}
Severity: {severity}
Patient context: {patient_info}

Research context:
{rag_context[:3000]}

Synthesize the key clinical findings relevant to this presentation. Focus on:
1. Most likely diagnostic categories supported by literature
2. Red flags or urgency indicators
3. Recommended diagnostic workup from guidelines
Be concise and clinically focused."""

    try:
        synthesis_content = await _invoke_llm(
            llm,
            [
                SystemMessage(content=RESEARCH_SYSTEM),
                HumanMessage(content=synthesis_prompt),
            ],
        )
    except Exception as exc:
        log.error("agent.research.llm_failed", exc=str(exc))
        # Fall back to raw PubMed context so the pipeline can still continue
        synthesis_content = rag_context[:1500]

    duration_ms = int(
        (datetime.now(timezone.utc) - start).total_seconds() * 1000
    )
    log.info(
        "agent.research.complete",
        pubmed_count=len(research_results),
        qdrant_count=len(qdrant_results),
        duration_ms=duration_ms,
    )

    return {
        "research_results": [dict(r) for r in research_results],
        "rag_context":      synthesis_content,
        "current_agent":    "research",
        "next_agent":       "diagnosis",
        "agent_logs": [
            {
                "agent":     "Research Agent",
                "action":    "pubmed_search",
                "content":   f"Found {len(research_results)} PubMed articles and {len(qdrant_results)} indexed documents.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            {
                "agent":     "Research Agent",
                "action":    "synthesis",
                "content":   synthesis_content[:300] + "...",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        ],
    }