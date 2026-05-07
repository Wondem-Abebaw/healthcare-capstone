'use client'
import { motion, AnimatePresence } from 'framer-motion'
import type { AgentLogEntry } from '@/types'
import { Stethoscope, FlaskConical, Brain, FileText, Cpu } from 'lucide-react'

const AGENT_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  'Intake Agent':    { icon: Stethoscope, color: 'var(--color-cyan-bright)', bg: 'color-mix(in srgb, var(--color-cyan-bright) 10%, transparent)' },
  'Research Agent':  { icon: FlaskConical, color: 'var(--color-vital)',       bg: 'color-mix(in srgb, var(--color-vital) 10%, transparent)' },
  'Diagnosis Agent': { icon: Brain,        color: 'var(--color-warn)',        bg: 'color-mix(in srgb, var(--color-warn) 10%, transparent)' },
  'Report Agent':    { icon: FileText,     color: 'var(--color-subtext)',     bg: 'var(--color-muted)' },
}

const ACTION_LABELS: Record<string, string> = {
  symptom_extraction:      'Extracting symptoms',
  pubmed_search:           'Searching PubMed',
  synthesis:               'Synthesizing research',
  differential_diagnosis:  'Building differential Dx',
  fhir_generation:         'Generating FHIR bundle',
  storage:                 'Storing to MinIO',
  skip:                    'Skipped',
}

const AGENTS = ['Intake Agent', 'Research Agent', 'Diagnosis Agent', 'Report Agent']

export function AgentTimeline({ logs, activeAgent }: { logs: AgentLogEntry[]; activeAgent: string | null }) {
  return (
    <div style={{ padding: '1rem' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-subtext)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.25rem' }}>
        Agent Pipeline
      </p>

      {/* Status grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {AGENTS.map(name => {
          const meta = AGENT_META[name]
          const Icon = meta?.icon ?? Cpu
          const isDone = logs.some(l => l.agent === name)
          const isActive = activeAgent && name.toLowerCase().startsWith(activeAgent.toLowerCase())
          return (
            <div key={name} style={{
              borderRadius: '0.5rem',
              border: `1px solid ${isActive ? 'color-mix(in srgb, var(--color-cyan-bright) 30%, transparent)' : 'var(--color-border)'}`,
              padding: '0.625rem',
              background: isActive ? meta?.bg : isDone ? 'color-mix(in srgb, var(--color-muted) 30%, transparent)' : 'color-mix(in srgb, var(--color-muted) 10%, transparent)',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                <Icon size={11} color={isActive ? meta?.color : isDone ? 'var(--color-subtext)' : 'var(--color-ghost)'} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: isActive ? meta?.color : isDone ? 'var(--color-subtext)' : 'var(--color-ghost)' }}>
                  {name.replace(' Agent', '')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{
                  width: '0.375rem', height: '0.375rem', borderRadius: '50%',
                  background: isActive ? 'var(--color-cyan-bright)' : isDone ? 'var(--color-vital)' : 'var(--color-border)',
                  animation: isActive ? 'pulse 1.5s infinite' : 'none',
                }} />
                <span style={{ color: 'var(--color-ghost)', fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>
                  {isActive ? 'running' : isDone ? 'done' : 'waiting'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Log entries */}
      {logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
            <Cpu size={14} color="var(--color-ghost)" />
          </div>
          <p style={{ color: 'var(--color-ghost)', fontSize: '0.75rem' }}>Send a message to start the pipeline.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <AnimatePresence initial={false}>
            {logs.map((log, i) => {
              const meta = AGENT_META[log.agent]
              const Icon = meta?.icon ?? Cpu
              return (
                <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
                  style={{ display: 'flex', gap: '0.625rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', border: `1px solid ${meta?.color ?? 'var(--color-border)'}`, background: meta?.bg ?? 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={10} color={meta?.color ?? 'var(--color-ghost)'} />
                    </div>
                    {i < logs.length - 1 && <div style={{ width: '1px', flex: 1, background: 'var(--color-border)', marginTop: '0.25rem', minHeight: '12px' }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: '0.5rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: meta?.color ?? 'var(--color-ghost)' }}>{log.agent.replace(' Agent', '')}</span>
                      <span style={{ color: 'var(--color-ghost)', fontSize: '0.65rem' }}>·</span>
                      <span style={{ color: 'var(--color-ghost)', fontSize: '0.65rem' }}>{ACTION_LABELS[log.action] ?? log.action}</span>
                    </div>
                    <p style={{ color: 'var(--color-subtext)', fontSize: '0.75rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {log.content}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
