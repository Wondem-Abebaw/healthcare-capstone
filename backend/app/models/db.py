from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


def gen_uuid():
    return str(uuid.uuid4())


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status = Column(String, nullable=False, default="active")
    patient_name = Column(String)
    patient_age = Column(Integer)
    patient_gender = Column(String)
    chief_complaint = Column(Text)
    metadata_ = Column("metadata", JSONB, default=dict)

    messages = relationship("Message", back_populates="session", cascade="all, delete")
    agent_logs = relationship("AgentLog", back_populates="session", cascade="all, delete")
    reports = relationship("Report", back_populates="session", cascade="all, delete")
    documents = relationship("Document", back_populates="session", cascade="all, delete")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    agent_name = Column(String)
    metadata_ = Column("metadata", JSONB, default=dict)

    session = relationship("Session", back_populates="messages")


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    agent_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    input_ = Column("input", JSONB)
    output_ = Column("output", JSONB)
    duration_ms = Column(Integer)
    status = Column(String, nullable=False, default="success")

    session = relationship("Session", back_populates="agent_logs")


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    fhir_bundle = Column(JSONB, nullable=False)
    summary = Column(Text)
    differential_dx = Column(JSONB)
    minio_key = Column(String)
    status = Column(String, nullable=False, default="draft")

    session = relationship("Session", back_populates="reports")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    filename = Column(String, nullable=False)
    minio_key = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer)
    indexed = Column(Boolean, nullable=False, default=False)
    metadata_ = Column("metadata", JSONB, default=dict)

    session = relationship("Session", back_populates="documents")
