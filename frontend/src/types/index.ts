export interface Session {
  id: string
  created_at: string
  status: 'active' | 'completed' | 'error'
  patient_name: string | null
  patient_age: number | null
  patient_gender: string | null
  chief_complaint: string | null
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'agent'
  content: string
  agent_name: string | null
  created_at: string
}

export interface AgentLogEntry {
  agent: string
  action: string
  content: string
  timestamp: string
}

export interface DiagnosisEntry {
  condition: string
  icd10_code: string
  probability: 'High' | 'Moderate' | 'Low'
  confidence: number
  reasoning: string
  supporting_evidence: string[]
  recommended_workup: string[]
}

export interface Report {
  id: string
  session_id: string
  created_at: string
  fhir_bundle: Record<string, unknown>
  summary: string | null
  differential_dx: DiagnosisEntry[] | null
  minio_key: string | null
  status: string
}

export interface Document {
  id: string
  session_id: string | null
  filename: string
  content_type: string
  size_bytes: number | null
  indexed: boolean
  created_at: string
}

// SSE event types from backend
export type SSEEvent =
  | { type: 'agent_start'; agent: string; message: string }
  | { type: 'agent_log'; agent: string; action: string; content: string }
  | { type: 'complete'; differential_dx: DiagnosisEntry[]; red_flags: string[]; report_summary: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
