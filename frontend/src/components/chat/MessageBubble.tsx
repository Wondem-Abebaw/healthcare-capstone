'use client'
import { motion } from 'framer-motion'
import type { Message } from '@/types'
import { User, Bot, Stethoscope } from 'lucide-react'
import { format } from 'date-fns'

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', gap: '0.75rem', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {/* Avatar */}
      <div style={{
        width: '1.75rem', height: '1.75rem', borderRadius: '50%', flexShrink: 0, marginTop: '0.25rem',
        border: `1px solid ${isUser ? 'var(--color-cyan-dim)' : 'var(--color-border)'}`,
        background: isUser ? 'color-mix(in srgb, var(--color-cyan-bright) 10%, transparent)' : 'var(--color-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser
          ? <User size={14} color="var(--color-cyan-bright)" />
          : message.agent_name
          ? <Stethoscope size={14} color="var(--color-vital)" />
          : <Bot size={14} color="var(--color-subtext)" />}
      </div>

      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: '0.25rem' }}>
        {!isUser && message.agent_name && (
          <span style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', paddingInline: '0.25rem' }}>
            {message.agent_name}
          </span>
        )}
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: isUser ? '1rem 0.25rem 1rem 1rem' : '0.25rem 1rem 1rem 1rem',
          fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-ink)',
          background: isUser
            ? 'color-mix(in srgb, var(--color-cyan-mid) 20%, transparent)'
            : 'var(--color-panel)',
          border: `1px solid ${isUser ? 'color-mix(in srgb, var(--color-cyan-dim) 50%, transparent)' : 'var(--color-border)'}`,
        }}>
          {message.content.split('\n').map((line, i) => (
            <p key={i} style={{ margin: i > 0 ? '0.375rem 0 0' : '0' }}>{line}</p>
          ))}
        </div>
        <span style={{ color: 'var(--color-ghost)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', paddingInline: '0.25rem' }}>
          {format(new Date(message.created_at), 'HH:mm')}
        </span>
      </div>
    </motion.div>
  )
}
