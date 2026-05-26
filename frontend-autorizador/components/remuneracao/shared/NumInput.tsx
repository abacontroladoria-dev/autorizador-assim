'use client'

import { useState, useEffect } from 'react'

interface Props {
  value: number;
  onSave: (v: number) => void;
  className?: string;
  step?: number;
  min?: number;
  max?: number;
}

export default function NumInput({ value, onSave, className, step, min, max }: Props) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return (
    <input type="number" value={v} min={min} max={max} step={step || 1} className={className}
      onChange={e => setV(e.target.value)}
      onBlur={() => onSave(parseFloat(v) || value)} />
  )
}
