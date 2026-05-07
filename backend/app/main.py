"""
Healthcare AI Capstone — FastAPI main application.
Multi-agent LangGraph system with Qdrant + MinIO + PostgreSQL.
"""
import structlog
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import get_settings
from app.core.database import engine, Base
from app.core.vector_store import get_qdrant
from app.api.routes import sessions, chat, documents

# ── Logging ────────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
logging.basicConfig(level=logging.INFO)
log = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup.begin", env=settings.app_env)
    # Init Qdrant collection
    try:
        await get_qdrant()
        log.info("startup.qdrant.ok")
    except Exception as exc:
        log.warning("startup.qdrant.failed", exc=str(exc))

    log.info("startup.complete")
    yield
    log.info("shutdown")


app = FastAPI(
    title="Healthcare AI Capstone",
    description="Multi-agent clinical decision support system",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routes ─────────────────────────────────────────────────────────────────
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")


@app.get("/health")
async def health():
    services = {}
    try:
        client = await get_qdrant()
        collections = await client.get_collections()
        services["qdrant"] = f"ok ({len(collections.collections)} collections)"
    except Exception as exc:
        services["qdrant"] = f"error: {exc}"

    return {
        "status": "ok",
        "version": "1.0.0",
        "env": settings.app_env,
        "services": services,
    }
