# Healthcare AI Capstone — Multi-Agent Clinical Decision Support System

> **Project 6** of the AI Engineering curriculum. The most complex project in the series.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (3000)                   │
│  Dashboard · Chat+SSE · Agent Timeline · FHIR Report Viewer │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / SSE
┌───────────────────────────▼─────────────────────────────────┐
│                  FastAPI Backend (8000)                       │
│                                                               │
│  ┌──────────────────── LangGraph ─────────────────────────┐  │
│  │  Supervisor → Intake → Research → Diagnosis → Report   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Qdrant (6333)    PostgreSQL (5432)    MinIO (9000)           │
│  Vector Search    Sessions/Reports     Object Storage         │
│  ↳ Replaces       ↳ FHIR bundles       ↳ Replaces GCS        │
│    Vertex AI VS     Agent logs           Medical docs         │
└─────────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| LLM | Google Gemini 1.5 Flash/Pro | Free tier available |
| Agents | LangGraph 0.2 | Supervisor pattern |
| Observability | LangSmith | Tracing + evals |
| Vector DB | **Qdrant** (Docker) | Replaces Vertex AI Vector Search |
| Object Storage | **MinIO** (Docker) | Replaces GCS — S3-compatible |
| Relational DB | PostgreSQL 16 | Sessions, reports, agent logs |
| Backend | FastAPI + asyncpg | SSE streaming |
| Frontend | Next.js 14 App Router | TypeScript + Tailwind |
| FHIR | fhir.resources 8.0 | R4-compliant bundles |
| Medical Search | PubMed E-utilities API | Free, no key required |

## Agents

| Agent | Model | Responsibility |
|-------|-------|---------------|
| **Intake** | Gemini 1.5 Flash | Extracts symptoms, duration, severity, history |
| **Research** | Gemini 1.5 Flash | PubMed search + Qdrant RAG synthesis |
| **Diagnosis** | Gemini 1.5 Pro | Differential Dx with ICD-10, confidence, workup |
| **Report** | Gemini 1.5 Flash | FHIR R4 bundle + narrative report → MinIO |

## Quick Start

### 1. Prerequisites
- Docker + Docker Compose
- Google AI Studio API key (free): https://aistudio.google.com
- LangSmith API key (free): https://smith.langchain.com

### 2. Configure
```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add your keys:
#   GOOGLE_API_KEY=your_key
#   LANGCHAIN_API_KEY=your_key
```

### 3. Run
```bash
docker-compose up --build
```

Services will start at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (user: `hc_minio_user`, pass: `hc_minio_secret`)
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### 4. Use it
1. Open http://localhost:3000
2. Click **New Session** — optionally enter patient demographics
3. Type or click a suggested symptom prompt
4. Watch the 4 agents run live in the **Timeline** panel
5. See **Differential Diagnosis** in the Report panel
6. View the full **FHIR R4 report** — download the JSON bundle

## Local Development (no Docker)

```bash
# Start infrastructure only
docker-compose up qdrant postgres minio minio_init -d

# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add API keys
uvicorn app.main:app --reload --port 8000    #first run: docker compose up qdrant postgres minio minio_init -d

# Frontend
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Uploading Medical Documents (RAG)

In a session, click the **paperclip icon** to upload a PDF or TXT file.
The system will:
1. Upload the file to MinIO (`medical-documents` bucket)
2. Extract + chunk the text
3. Embed and index into Qdrant
4. The **Research Agent** will automatically include it in future queries

## Production Swap Guide

| Component | Docker (Dev) | Production |
|-----------|-------------|------------|
| MinIO | `localhost:9000` | AWS S3 / Backblaze B2 / Wasabi |
| Qdrant | `localhost:6333` | Qdrant Cloud / self-hosted k8s |
| PostgreSQL | `localhost:5432` | Cloud SQL / Supabase / RDS |
| LLM | Gemini Flash/Pro | Same or upgrade to Gemini Ultra |

Only `MINIO_ENDPOINT`, `QDRANT_URL`, `DATABASE_URL` in `.env` need to change.

## API Reference

| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/v1/sessions` | Create session |
| GET | `/api/v1/sessions` | List sessions |
| GET | `/api/v1/sessions/{id}` | Get session |
| GET | `/api/v1/sessions/{id}/messages` | Get chat history |
| GET | `/api/v1/sessions/{id}/report` | Get FHIR report |
| POST | `/api/v1/chat/stream` | **SSE** — run agent pipeline |
| POST | `/api/v1/documents` | Upload + index document |
| GET | `/health` | Health check |

## Disclaimer

This system is for **educational and research purposes only**.
All AI-generated clinical outputs must be reviewed by a licensed healthcare professional.
This is not FDA-cleared medical software.
