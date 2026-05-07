"""
LangGraph multi-agent graph — Healthcare AI Capstone.
Updated for LangGraph 1.x API.

Flow: START → supervisor → intake → supervisor → research → supervisor
           → diagnosis → supervisor → report → END
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.agents.state import HealthcareState
from app.agents.intake import intake_agent
from app.agents.research import research_agent
from app.agents.diagnosis import diagnosis_agent
from app.agents.report import report_agent
from app.core.config import get_settings
import structlog

log = structlog.get_logger()
settings = get_settings()


# ── Supervisor (pure router) ───────────────────────────────────────────────
def supervisor_router(state: HealthcareState) -> str:
    """Returns the name of the next node to execute."""
    next_agent = state.get("next_agent", "intake")
    iteration  = state.get("iteration_count", 0)

    if iteration > 10:
        log.warning("supervisor.iteration_limit", session_id=state.get("session_id"))
        return END

    log.info("supervisor.route", next_agent=next_agent, iteration=iteration)
    return next_agent


def _inc_iteration(state: HealthcareState) -> dict:
    return {"iteration_count": state.get("iteration_count", 0) + 1}


# ── Graph construction ─────────────────────────────────────────────────────
def build_graph() -> StateGraph:
    builder = StateGraph(HealthcareState)

    # Agent nodes
    builder.add_node("intake",    intake_agent)
    builder.add_node("research",  research_agent)
    builder.add_node("diagnosis", diagnosis_agent)
    builder.add_node("report",    report_agent)

    # Entry point → supervisor conditional branch (no dedicated supervisor node)
    builder.set_conditional_entry_point(
        supervisor_router,
        {
            "intake":    "intake",
            "research":  "research",
            "diagnosis": "diagnosis",
            "report":    "report",
            END:         END,
        },
    )

    # Each agent loops back through supervisor_router
    for node in ("intake", "research", "diagnosis", "report"):
        builder.add_conditional_edges(
            node,
            supervisor_router,
            {
                "intake":    "intake",
                "research":  "research",
                "diagnosis": "diagnosis",
                "report":    "report",
                END:         END,
            },
        )

    return builder


# ── Compiled singleton ─────────────────────────────────────────────────────
_graph       = None
_checkpointer = MemorySaver()


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph().compile(checkpointer=_checkpointer)
        log.info("langgraph.compiled")
    return _graph


# ── Public API ─────────────────────────────────────────────────────────────
async def run_healthcare_pipeline(
    session_id: str,
    messages: list,
    patient_info: dict,
) -> tuple[HealthcareState, list[dict]]:
    """Run the full pipeline and return (final_state, agent_logs)."""
    graph = get_graph()

    initial_state = _make_initial_state(session_id, messages, patient_info)
    config        = {"configurable": {"thread_id": session_id}}
    final_state   = await graph.ainvoke(initial_state, config=config)

    return final_state, final_state.get("agent_logs", [])


async def stream_healthcare_pipeline(
    session_id: str,
    messages: list,
    patient_info: dict,
):
    """
    Async generator yielding SSE-ready dicts as each agent completes.
    Yields: agent_start | agent_log | complete
    """
    graph         = get_graph()
    initial_state = _make_initial_state(session_id, messages, patient_info)
    config        = {"configurable": {"thread_id": session_id}}

    async for event in graph.astream_events(initial_state, config=config, version="v2"):
        event_name = event.get("event", "")
        node_name  = event.get("name", "")

        if event_name == "on_chain_start" and node_name in (
            "intake", "research", "diagnosis", "report"
        ):
            yield {
                "type":    "agent_start",
                "agent":   node_name,
                "message": f"{node_name.capitalize()} Agent is working...",
            }

        elif event_name == "on_chain_end" and node_name in (
            "intake", "research", "diagnosis", "report"
        ):
            output = event.get("data", {}).get("output", {})
            for entry in output.get("agent_logs", []):
                yield {
                    "type":    "agent_log",
                    "agent":   entry.get("agent", node_name),
                    "action":  entry.get("action", ""),
                    "content": entry.get("content", ""),
                }

            if node_name == "report":
                yield {
                    "type":            "complete",
                    "fhir_bundle":     output.get("fhir_bundle", {}),
                    "report_summary":  output.get("report_summary", ""),
                    "differential_dx": output.get("differential_dx", []),
                    "red_flags":       output.get("red_flags", []),
                }


def _make_initial_state(
    session_id: str,
    messages: list,
    patient_info: dict,
) -> HealthcareState:
    return HealthcareState(
        session_id       = session_id,
        messages         = messages,
        patient_info     = patient_info,
        symptoms         = [],
        symptom_duration = "",
        severity         = "moderate",
        research_results = [],
        rag_context      = "",
        differential_dx  = [],
        red_flags        = [],
        diagnosis_summary= "",
        fhir_bundle      = {},
        report_summary   = "",
        current_agent    = "supervisor",
        next_agent       = "intake",
        iteration_count  = 0,
        error            = None,
        agent_logs       = [],
    )
