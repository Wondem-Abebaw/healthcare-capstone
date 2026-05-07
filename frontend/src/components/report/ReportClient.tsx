'use client'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { getReport, getSession } from '@/lib/api'
import type { DiagnosisEntry } from '@/types'
import { format } from 'date-fns'
import { useState } from 'react'
import { ArrowLeft, FileText, Shield, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Activity, Stethoscope } from 'lucide-react'

const V = {
  void: 'var(--color-void)', surface: 'var(--color-surface)', panel: 'var(--color-panel)',
  border: 'var(--color-border)', muted: 'var(--color-muted)', ink: 'var(--color-ink)',
  subtext: 'var(--color-subtext)', ghost: 'var(--color-ghost)', vital: 'var(--color-vital)',
  warn: 'var(--color-warn)', alert: 'var(--color-alert)', cyan: 'var(--color-cyan-bright)',
  cyanDim: 'var(--color-cyan-dim)', mono: 'var(--font-mono)', display: 'var(--font-display)',
}

export function ReportClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const { data: session } = useQuery({ queryKey: ['session', sessionId], queryFn: () => getSession(sessionId) })
  const { data: report, isLoading, error } = useQuery({ queryKey: ['report', sessionId], queryFn: () => getReport(sessionId), retry: 2 })

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: V.subtext, fontFamily: V.mono, fontSize: '0.875rem', animation: 'pulse 2s infinite' }}>Fetching report...</p>
    </div>
  )

  if (error || !report) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
      <FileText size={40} color={V.ghost} />
      <p style={{ color: V.subtext }}>Report not found. The session may still be running.</p>
      <button className="btn-ghost" onClick={() => router.back()}>Go Back</button>
    </div>
  )

  const differential = (report.differential_dx ?? []) as DiagnosisEntry[]

  return (
    <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '2rem' }}>
        <button className="btn-ghost" style={{ gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }} onClick={() => router.back()}>
          <ArrowLeft size={16} /> Back to Session
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '0.5rem', background: `color-mix(in srgb, ${V.vital} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${V.vital} 30%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={14} color={V.vital} />
              </div>
              <span style={{ fontFamily: V.mono, fontSize: '0.7rem', color: V.vital, textTransform: 'uppercase', letterSpacing: '0.15em' }}>FHIR R4 Report</span>
            </div>
            <h1 style={{ fontFamily: V.display, fontSize: '2rem', color: V.ink }}>
              {session?.patient_name ?? 'Anonymous Patient'}
            </h1>
            <p style={{ color: V.subtext, fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {[session?.patient_gender, session?.patient_age && `age ${session.patient_age}`, session?.chief_complaint].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontFamily: V.mono, background: `color-mix(in srgb, ${report.status === 'finalized' ? V.vital : V.warn} 10%, transparent)`, color: report.status === 'finalized' ? V.vital : V.warn, border: `1px solid color-mix(in srgb, ${report.status === 'finalized' ? V.vital : V.warn} 30%, transparent)` }}>
              <CheckCircle2 size={12} /> {report.status}
            </div>
            <p style={{ color: V.ghost, fontSize: '0.7rem', fontFamily: V.mono, marginTop: '0.375rem' }}>
              {format(new Date(report.created_at), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Disclaimer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="panel-glass" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', borderColor: `color-mix(in srgb, ${V.warn} 20%, transparent)`, background: `color-mix(in srgb, ${V.warn} 5%, transparent)` }}>
        <AlertTriangle size={16} color={V.warn} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
        <p style={{ color: `color-mix(in srgb, ${V.warn} 80%, transparent)`, fontSize: '0.75rem', lineHeight: 1.6 }}>
          <strong style={{ color: V.warn }}>AI-Generated Report — Not for Clinical Use.</strong> This report is produced by an experimental AI system for research and educational purposes only. All findings must be verified by a licensed healthcare professional before any clinical action.
        </p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {report.summary && (
          <Section title="Clinical Summary" icon={Stethoscope} defaultOpen>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {report.summary.split('\n').filter(p => p.trim()).map((para, i) => (
                <p key={i} style={{ color: V.subtext, lineHeight: 1.7, fontSize: '0.9375rem' }}>{para}</p>
              ))}
            </div>
          </Section>
        )}

        {differential.length > 0 && (
          <Section title={`Differential Diagnosis (${differential.length})`} icon={Activity} defaultOpen>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {differential.map((dx, i) => <DxCard key={i} dx={dx} rank={i + 1} />)}
            </div>
          </Section>
        )}

        <Section title="FHIR R4 Bundle" icon={Shield}>
          <FHIRExplorer bundle={report.fhir_bundle} />
        </Section>

        {report.minio_key && (
          <div className="panel-glass" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: V.muted, border: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={14} color={V.subtext} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: V.ink, fontSize: '0.875rem' }}>Report stored in MinIO</p>
              <p style={{ color: V.ghost, fontSize: '0.7rem', fontFamily: V.mono, marginTop: '0.125rem' }}>{report.minio_key}</p>
            </div>
            <ExternalLink size={16} color={V.ghost} />
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel-glass" style={{ overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
        onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, var(--color-muted) 30%, transparent)`)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Icon size={16} color="var(--color-subtext)" />
        <span style={{ color: 'var(--color-ink)', fontWeight: 500, flex: 1, textAlign: 'left', fontSize: '0.9375rem' }}>{title}</span>
        {open ? <ChevronUp size={16} color="var(--color-ghost)" /> : <ChevronDown size={16} color="var(--color-ghost)" />}
      </button>
      {open && <div style={{ padding: '0 1.25rem 1.25rem' }}>{children}</div>}
    </motion.div>
  )
}

function DxCard({ dx, rank }: { dx: DiagnosisEntry; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 1)
  const probColor = dx.probability === 'High' ? 'var(--color-alert)' : dx.probability === 'Moderate' ? 'var(--color-warn)' : 'var(--color-vital)'

  return (
    <div style={{ borderRadius: '0.75rem', border: `1px solid ${rank === 1 ? 'var(--color-cyan-dim)' : 'var(--color-border)'}`, background: rank === 1 ? `color-mix(in srgb, var(--color-cyan-bright) 5%, transparent)` : `color-mix(in srgb, var(--color-muted) 30%, transparent)`, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: 'var(--color-muted)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-subtext)', flexShrink: 0 }}>{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-ink)', fontSize: '0.9375rem', fontWeight: 500 }}>{dx.condition}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-ghost)' }}>{dx.icd10_code}</span>
          </div>
        </div>
        <span className={`tag-${dx.probability.toLowerCase()}`} style={{ flexShrink: 0 }}>{dx.probability}</span>
      </button>
      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <p style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.375rem' }}>Reasoning</p>
            <p style={{ color: 'var(--color-subtext)', fontSize: '0.875rem', lineHeight: 1.6 }}>{dx.reasoning}</p>
          </div>
          {dx.supporting_evidence?.length > 0 && (
            <div>
              <p style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.375rem' }}>Supporting Evidence</p>
              {dx.supporting_evidence.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--color-vital)', flexShrink: 0, marginTop: '0.125rem' }}>›</span>
                  <span style={{ color: 'var(--color-subtext)', fontSize: '0.8125rem' }}>{e}</span>
                </div>
              ))}
            </div>
          )}
          {dx.recommended_workup?.length > 0 && (
            <div>
              <p style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.375rem' }}>Recommended Workup</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {dx.recommended_workup.map((w, i) => (
                  <span key={i} style={{ color: 'var(--color-subtext)', fontSize: '0.75rem', background: 'var(--color-muted)', border: '1px solid var(--color-border)', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', fontFamily: 'var(--font-mono)' }}>{w}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

function FHIRExplorer({ bundle }: { bundle: Record<string, unknown> }) {
  const entries = (bundle?.entry as unknown[]) ?? []
  const resourceTypes = entries.reduce<Record<string, number>>((acc, e) => {
    const type = ((e as Record<string, unknown>)?.resource as Record<string, unknown>)?.resourceType as string
    if (type) acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {Object.entries(resourceTypes).map(([type, count]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'var(--color-muted)', border: '1px solid var(--color-border)', padding: '0.375rem 0.625rem', borderRadius: '0.5rem' }}>
            <span style={{ color: 'var(--color-cyan-bright)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{type}</span>
            <span style={{ color: 'var(--color-ghost)', fontSize: '0.75rem' }}>×{count}</span>
          </div>
        ))}
      </div>
      <div className="scanline" style={{ background: 'var(--color-void)', border: '1px solid var(--color-border)', borderRadius: '0.75rem', padding: '1rem', overflowX: 'auto', maxHeight: '20rem', overflowY: 'auto' }}>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-subtext)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify({ ...bundle, entry: `[${entries.length} entries]` }, null, 2)}
        </pre>
      </div>
      <button className="btn-ghost" style={{ fontSize: '0.8125rem', gap: '0.5rem', alignSelf: 'flex-start' }}
        onClick={() => {
          const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
          const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'fhir-bundle.json' })
          a.click()
        }}>
        <ExternalLink size={14} /> Download FHIR Bundle JSON
      </button>
    </div>
  )
}
