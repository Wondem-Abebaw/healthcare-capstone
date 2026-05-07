'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { getSessions, createSession, deleteSession } from '@/lib/api'
import type { Session } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Plus, Trash2, ChevronRight, Stethoscope, FlaskConical, FileText, Clock, AlertTriangle, Shield } from 'lucide-react'

const s = {
  page:       { maxWidth: '72rem', margin: '0 auto', padding: '2.5rem 1.5rem' } as const,
  logoBox:    { width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'color-mix(in srgb, var(--color-cyan-mid) 20%, transparent)', border: '1px solid var(--color-cyan-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const,
  tag:        { fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-cyan-bright)', letterSpacing: '0.15em', textTransform: 'uppercase' as const },
  h1:         { fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--color-ink)', lineHeight: 1.1, marginTop: '1rem' } as const,
  h1accent:   { color: 'var(--color-cyan-bright)' } as const,
  subtitle:   { color: 'var(--color-subtext)', marginTop: '0.75rem', maxWidth: '32rem', lineHeight: 1.6 } as const,
  statsRow:   { display: 'flex', gap: '1.5rem', marginTop: '2rem', flexWrap: 'wrap' as const } as const,
  statItem:   { display: 'flex', alignItems: 'center', gap: '0.5rem' } as const,
  pipeline:   { padding: '1.25rem', marginBottom: '2rem' } as const,
  pipeLabel:  { fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-ghost)', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '1rem' },
  pipeRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', overflowX: 'auto' as const, paddingBottom: '0.25rem' } as const,
  pipeStep:   { padding: '0.5rem 0.75rem', textAlign: 'center' as const, minWidth: '90px', flexShrink: 0 } as const,
  sessionHdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' } as const,
  h2:         { fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--color-ink)' } as const,
  emptyBox:   { padding: '3rem', textAlign: 'center' as const } as const,
  disclaimer: { marginTop: '2.5rem', display: 'flex', gap: '0.75rem', padding: '1rem', borderRadius: '0.75rem', border: '1px solid color-mix(in srgb, var(--color-warn) 20%, transparent)', background: 'color-mix(in srgb, var(--color-warn) 5%, transparent)' } as const,
}

const pipeAgents = [
  { name: 'Intake',    desc: 'Symptom extraction', color: 'var(--color-cyan-bright)' },
  { name: 'Research',  desc: 'PubMed + RAG',        color: 'var(--color-vital)' },
  { name: 'Diagnosis', desc: 'Differential Dx',     color: 'var(--color-warn)' },
  { name: 'Report',    desc: 'FHIR R4 bundle',      color: 'var(--color-subtext)' },
]

export function DashboardClient() {
  const router = useRouter()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: sessions = [], isLoading } = useQuery({ queryKey: ['sessions'], queryFn: getSessions })

  const createMut = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['sessions'] }); router.push(`/session/${s.id}`) },
  })
  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return (
    <div style={s.page}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={s.logoBox}><Activity size={16} color="var(--color-cyan-bright)" /></div>
          <span style={s.tag}>MedAI — v1.0</span>
        </div>
        <h1 style={s.h1}>
          Clinical Decision<br />
          <span style={s.h1accent}>Support System</span>
        </h1>
        <p style={s.subtitle}>
          Multi-agent AI platform combining PubMed research, differential diagnosis,
          and FHIR R4 report generation. Not a substitute for clinical judgment.
        </p>
        <div style={s.statsRow}>
          {[{ icon: Stethoscope, label: 'Agents', value: '4' },
            { icon: FlaskConical, label: 'Sessions', value: String(sessions.length) },
            { icon: FileText, label: 'FHIR R4', value: 'Compliant' }].map(({ icon: Icon, label, value }) => (
            <div key={label} style={s.statItem}>
              <Icon size={14} color="var(--color-cyan-mid)" />
              <span style={{ color: 'var(--color-ghost)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{label}:</span>
              <span style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Pipeline */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="panel-glass" style={s.pipeline}>
        <p style={s.pipeLabel}>Agent Pipeline</p>
        <div style={s.pipeRow}>
          {pipeAgents.map((a, i) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <div className="panel-glass" style={s.pipeStep}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 500, color: a.color }}>{a.name}</div>
                <div style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', marginTop: '0.125rem' }}>{a.desc}</div>
              </div>
              {i < 3 && <ChevronRight size={12} color="var(--color-ghost)" style={{ flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Session list header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        style={s.sessionHdr}>
        <h2 style={s.h2}>Sessions</h2>
        <button className="btn-primary" style={{ gap: '0.5rem', fontSize: '0.875rem' }} onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Session
        </button>
      </motion.div>

      {/* Sessions */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => <div key={i} className="panel-glass" style={{ height: '5rem', animation: 'pulse 2s infinite' }} />)}
        </div>
      ) : sessions.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel-glass" style={s.emptyBox}>
          <Stethoscope size={40} color="var(--color-ghost)" style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--color-subtext)' }}>No sessions yet.</p>
          <p style={{ color: 'var(--color-ghost)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Start a new session to begin an AI-assisted assessment.</p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AnimatePresence>
            {sessions.map((session, i) => (
              <SessionCard key={session.id} session={session} index={i}
                onOpen={() => router.push(`/session/${session.id}`)}
                onDelete={() => deleteMut.mutate(session.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Disclaimer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={s.disclaimer}>
        <AlertTriangle size={16} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '0.125rem' }} />
        <p style={{ color: 'color-mix(in srgb, var(--color-warn) 80%, transparent)', fontSize: '0.75rem', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--color-warn)' }}>Clinical Disclaimer:</strong> This system is for educational
          and research purposes only. All outputs are AI-generated and must not be used for clinical decision-making
          without review by a licensed healthcare professional.
        </p>
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <NewSessionModal onClose={() => setShowModal(false)}
            onCreate={(data) => { createMut.mutate(data); setShowModal(false) }}
            loading={createMut.isPending} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SessionCard({ session, index, onOpen, onDelete }: { session: Session; index: number; onOpen: () => void; onDelete: () => void }) {
  const statusColor = { active: 'var(--color-cyan-bright)', completed: 'var(--color-vital)', error: 'var(--color-alert)' }[session.status] ?? 'var(--color-ghost)'

  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.05 }}
      className="panel-glass"
      style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'border-color 0.2s' }}
      onClick={onOpen}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-cyan-dim)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
      <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem', background: 'var(--color-muted)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Stethoscope size={16} color="var(--color-subtext)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--color-ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.patient_name ?? 'Anonymous Patient'}
          </span>
          {session.patient_age && <span style={{ color: 'var(--color-ghost)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>age {session.patient_age}</span>}
        </div>
        <p style={{ color: 'var(--color-subtext)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.125rem' }}>
          {session.chief_complaint ?? 'No complaint recorded'}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'capitalize', color: statusColor }}>{session.status}</div>
          <div style={{ color: 'var(--color-ghost)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem' }}>
            <Clock size={11} />
            {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ padding: '0.375rem', borderRadius: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ghost)', transition: 'all 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-alert)'; (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--color-alert) 10%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-ghost)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
          <Trash2 size={14} />
        </button>
        <ChevronRight size={16} color="var(--color-ghost)" />
      </div>
    </motion.div>
  )
}

function NewSessionModal({ onClose, onCreate, loading }: { onClose: () => void; onCreate: (data: Partial<Session>) => void; loading: boolean }) {
  const [form, setForm] = useState({ patient_name: '', patient_age: '', patient_gender: '', chief_complaint: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--color-void) 80%, transparent)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="panel-glass" style={{ width: '100%', maxWidth: '32rem', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Shield size={20} color="var(--color-cyan-bright)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--color-ink)' }}>New Clinical Session</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ color: 'var(--color-ghost)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.375rem' }}>Patient Name</label>
              <input className="input-base" placeholder="Optional" value={form.patient_name} onChange={e => set('patient_name', e.target.value)} />
            </div>
            <div>
              <label style={{ color: 'var(--color-ghost)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.375rem' }}>Age</label>
              <input className="input-base" type="number" placeholder="Optional" value={form.patient_age} onChange={e => set('patient_age', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ color: 'var(--color-ghost)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.375rem' }}>Gender</label>
            <select className="input-base" value={form.patient_gender} onChange={e => set('patient_gender', e.target.value)}>
              <option value="">Select (optional)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--color-ghost)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.375rem' }}>Chief Complaint</label>
            <textarea className="input-base" rows={3} style={{ resize: 'none' }} placeholder="Describe the main symptoms or reason for consultation..."
              value={form.chief_complaint} onChange={e => set('chief_complaint', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}
            onClick={() => onCreate({ patient_name: form.patient_name || undefined, patient_age: form.patient_age ? parseInt(form.patient_age) : undefined, patient_gender: form.patient_gender || undefined, chief_complaint: form.chief_complaint || undefined } as Partial<Session>)}>
            {loading ? 'Creating...' : 'Start Session'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
