from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env:    str = "development"
    secret_key: str = "dev-secret-key"
    cors_origins: str = "http://localhost:3002"

    # LLM (Google AI Studio — free tier available)
    google_api_key: str = ""

    # LangSmith observability
    langchain_api_key:      str  = ""
    langchain_tracing_v2:   bool = True
    langchain_project:      str  = "healthcare-ai-capstone"

    # Database
    database_url: str = "postgresql+asyncpg://hc_user:hc_secret@localhost:5432/healthcare_ai"

    # Qdrant — replaces Vertex AI Vector Search
    qdrant_url:        str = "http://localhost:6333"
    qdrant_collection: str = "medical_literature"
    qdrant_dim:        int = 768   # text-embedding-004 output dim
    qdrant_api_key: str = ""

    # MinIO — replaces GCS (S3-compatible; swap endpoint for prod)
    minio_endpoint:       str  = "localhost:9000"
    minio_access_key:     str  = "hc_minio_user"
    minio_secret_key:     str  = "hc_minio_secret"
    minio_secure:         bool = False
    minio_docs_bucket:    str  = "medical-documents"
    minio_reports_bucket: str  = "fhir-reports"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
