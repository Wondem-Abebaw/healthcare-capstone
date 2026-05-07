-- Healthcare AI Capstone — DB Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      TEXT NOT NULL DEFAULT 'active',  -- active | completed | error
    patient_name TEXT,
    patient_age  INTEGER,
    patient_gender TEXT,
    chief_complaint TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'
);

-- Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    role        TEXT NOT NULL,  -- user | assistant | agent
    content     TEXT NOT NULL,
    agent_name  TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'
);

-- Agent Logs ───────────────────────────────────────────────────────────────
CREATE TABLE agent_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    input       JSONB,
    output      JSONB,
    duration_ms INTEGER,
    status      TEXT NOT NULL DEFAULT 'success'  -- success | error
);

-- FHIR Reports ─────────────────────────────────────────────────────────────
CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fhir_bundle     JSONB NOT NULL,
    summary         TEXT,
    differential_dx JSONB,   -- list of {condition, probability, reasoning}
    minio_key       TEXT,    -- path in minio for PDF export
    status          TEXT NOT NULL DEFAULT 'draft'  -- draft | finalized
);

-- Uploaded Documents ───────────────────────────────────────────────────────
CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filename    TEXT NOT NULL,
    minio_key   TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes  INTEGER,
    indexed     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata    JSONB NOT NULL DEFAULT '{}'
);

-- Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_agent_logs_session ON agent_logs(session_id, created_at);
CREATE INDEX idx_reports_session ON reports(session_id);
CREATE INDEX idx_documents_session ON documents(session_id);
