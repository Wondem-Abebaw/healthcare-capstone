import axios from 'axios'
import type { Session, Message, Report, Document } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// Sessions
export const createSession = (data: Partial<Session>) =>
  api.post<Session>('/sessions', data).then(r => r.data)

export const getSessions = () =>
  api.get<Session[]>('/sessions').then(r => r.data)

export const getSession = (id: string) =>
  api.get<Session>(`/sessions/${id}`).then(r => r.data)

export const deleteSession = (id: string) =>
  api.delete(`/sessions/${id}`)

// Messages
export const getMessages = (sessionId: string) =>
  api.get<Message[]>(`/sessions/${sessionId}/messages`).then(r => r.data)

// Report
export const getReport = (sessionId: string) =>
  api.get<Report>(`/sessions/${sessionId}/report`).then(r => r.data)

// Documents
export const uploadDocument = (file: File, sessionId?: string) => {
  const form = new FormData()
  form.append('file', file)
  if (sessionId) form.append('session_id', sessionId)
  return api.post<Document>('/documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getDocuments = (sessionId?: string) =>
  api.get<Document[]>('/documents', { params: sessionId ? { session_id: sessionId } : {} })
    .then(r => r.data)

// SSE streaming
export function streamChat(
  sessionId: string,
  message: string,
  onEvent: (event: unknown) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  let cancelled = false

  fetch(`${BASE}/api/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  }).then(async res => {
    if (!res.ok) {
      onError(`HTTP ${res.status}`)
      return
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!cancelled) {
      const { done, value } = await reader.read()
      if (done) { onDone(); break }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'done') { onDone(); return }
            if (parsed.type === 'error') { onError(parsed.message); return }
            onEvent(parsed)
          } catch { /* skip */ }
        }
      }
    }
  }).catch(err => onError(String(err)))

  return () => { cancelled = true }
}
