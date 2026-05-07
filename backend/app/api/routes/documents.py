"""
Documents route — upload PDFs, index them into Qdrant.
MinIO stores the raw file; Qdrant stores the vectors.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.vector_store import upsert_documents
from app.models.db import Document
from app.models.schemas import DocumentOut
from app.services.storage import upload_file
from app.core.config import get_settings
from pypdf import PdfReader
import uuid, io, structlog

log = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/documents", tags=["documents"])

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def _chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end].strip())
        start += size - overlap
    return [c for c in chunks if len(c) > 50]


@router.post("", response_model=DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    session_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ("application/pdf", "text/plain"):
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    doc_id = str(uuid.uuid4())
    minio_key = f"documents/{doc_id}/{file.filename}"

    # Upload raw file to MinIO
    await upload_file(
        bucket=settings.minio_docs_bucket,
        key=minio_key,
        data=data,
        content_type=file.content_type or "application/octet-stream",
        metadata={"original_filename": file.filename or ""},
    )

    # Extract text
    text = ""
    if file.content_type == "application/pdf":
        try:
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
        except Exception as exc:
            log.warning("documents.pdf_parse_error", exc=str(exc))
    else:
        text = data.decode("utf-8", errors="replace")

    # Chunk + index into Qdrant
    indexed = False
    if text.strip():
        chunks = _chunk_text(text)
        metadatas = [
            {
                "source": file.filename,
                "doc_id": doc_id,
                "chunk_index": i,
                "session_id": session_id or "",
            }
            for i in range(len(chunks))
        ]
        await upsert_documents(chunks, metadatas)
        indexed = True

    # Persist document record
    doc = Document(
        id=doc_id,
        session_id=session_id,
        filename=file.filename or "unknown",
        minio_key=minio_key,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        indexed=indexed,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    log.info("documents.uploaded", doc_id=doc_id, indexed=indexed, chunks=len(chunks) if indexed else 0)
    return doc


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    session_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Document)
    if session_id:
        q = q.where(Document.session_id == session_id)
    result = await db.execute(q.order_by(Document.created_at.desc()).limit(100))
    return result.scalars().all()
