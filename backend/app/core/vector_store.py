"""
Qdrant vector store.
Compatible with qdrant-client 1.17.x and langchain-google-genai 4.x
"""
from qdrant_client import AsyncQdrantClient, models
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.core.config import get_settings
import structlog, uuid

log      = structlog.get_logger()
settings = get_settings()

_client:     AsyncQdrantClient | None = None
_embeddings: GoogleGenerativeAIEmbeddings | None = None


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    global _embeddings
    if _embeddings is None:
        # langchain-google-genai 4.x model name
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=settings.google_api_key,
        )
    return _embeddings


async def get_qdrant() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None,)
        await _ensure_collection(_client)
    return _client


async def _ensure_collection(client: AsyncQdrantClient) -> None:
    existing = await client.get_collections()
    names    = [c.name for c in existing.collections]

    if settings.qdrant_collection not in names:
        await client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=models.VectorParams(
                size=settings.qdrant_dim,
                distance=models.Distance.COSINE,
            ),
            optimizers_config=models.OptimizersConfigDiff(indexing_threshold=20_000),
            hnsw_config=models.HnswConfigDiff(m=16, ef_construct=100, full_scan_threshold=10_000),
        )
        log.info("qdrant.collection.created", name=settings.qdrant_collection)


async def upsert_documents(texts: list[str], metadatas: list[dict]) -> list[str]:
    """Embed + upsert in batches of 50. Returns list of point IDs."""
    client     = await get_qdrant()
    embeddings = get_embeddings()
    ids        = [str(uuid.uuid4()) for _ in texts]
    vectors    = await embeddings.aembed_documents(texts)

    points = [
        models.PointStruct(id=ids[i], vector=vectors[i], payload={**metadatas[i], "text": texts[i]})
        for i in range(len(texts))
    ]
    for i in range(0, len(points), 50):
        await client.upsert(collection_name=settings.qdrant_collection, points=points[i:i+50])

    log.info("qdrant.upsert", count=len(points))
    return ids


async def similarity_search(
    query: str,
    top_k: int = 8,
    score_threshold: float = 0.45,
    filter_payload: dict | None = None,
) -> list[dict]:
    client       = await get_qdrant()
    embeddings   = get_embeddings()
    query_vector = await embeddings.aembed_query(query)

    query_filter = None
    if filter_payload:
        query_filter = models.Filter(must=[
            models.FieldCondition(key=k, match=models.MatchValue(value=v))
            for k, v in filter_payload.items()
        ])

    results = await client.search(
        collection_name=settings.qdrant_collection,
        query_vector=query_vector,
        limit=top_k,
        score_threshold=score_threshold,
        query_filter=query_filter,
        with_payload=True,
    )
    return [
        {
            "id":       str(r.id),
            "score":    r.score,
            "text":     r.payload.get("text", ""),
            "metadata": {k: v for k, v in r.payload.items() if k != "text"},
        }
        for r in results
    ]


async def delete_document(doc_id: str) -> None:
    client = await get_qdrant()
    await client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=models.PointIdsList(points=[doc_id]),
    )
