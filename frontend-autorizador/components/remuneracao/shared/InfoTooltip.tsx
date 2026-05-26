'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { B } from '../lib/constants'

interface Props { text: string }

export default function InfoTooltip({ text }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const modal = (open && mounted) ? createPortal(
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.65)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#1e2d4a', color: '#e2e8f0', borderRadius: '1rem', padding: '1.5rem',
                 maxWidth: '32rem', width: '100%', maxHeight: '80vh', overflowY: 'auto',
                 boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                       marginBottom: '0.875rem', gap: '0.75rem' }}>
          <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#90cdf4' }}>ℹ️ Saiba mais</span>
          <button onClick={() => setOpen(false)}
            style={{ color: '#94a3b8', background: 'none', border: 'none', fontSize: '1.25rem',
                     cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
        <div style={{ whiteSpace: 'pre-line', lineHeight: 1.75, fontSize: '0.85rem' }}>{text}</div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ background: B.blue, color: 'white', width: '1.2rem', height: '1.2rem',
                 borderRadius: '50%', fontSize: '0.65rem', fontWeight: 'bold',
                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                 flexShrink: 0, marginLeft: '0.375rem', border: 'none', cursor: 'pointer',
                 verticalAlign: 'middle', lineHeight: 1 }}
        title="Saiba mais">
        i
      </button>
      {modal}
    </>
  )
}
