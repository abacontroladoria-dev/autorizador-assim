'use client'

import { useState, useEffect } from 'react'
import { B, DEFAULT_CC_LIM } from '../lib/constants'
import type { ContratoAntigo } from '../lib/types'

// ─── ContractRow ──────────────────────────────────────────────────────────────
interface ContractRowProps {
  prof: string;
  initial?: Partial<ContratoAntigo>;
  onSave: (prof: string, v: ContratoAntigo) => void;
}

export function ContractRow({ prof, initial, onSave }: ContractRowProps) {
  const [v, setV] = useState({
    contrato: initial?.contrato ?? '',
    chSemanal: String(initial?.chSemanal ?? ''),
    salario: String(initial?.salario ?? ''),
  })
  const save = () => onSave(prof, {
    contrato: v.contrato,
    chSemanal: parseFloat(v.chSemanal) || 0,
    salario: parseFloat(v.salario) || 0,
  })
  return (
    <div className="bg-white border rounded-xl px-4 py-3">
      <div className="font-semibold text-sm mb-2" style={{ color: B.navy }}>{prof}</div>
      <div className="flex gap-2 flex-wrap text-xs text-gray-600">
        <label className="flex items-center gap-1">Contrato Nº
          <input value={v.contrato} placeholder="PS.ABA-..."
            className="ml-1 w-44 border rounded px-2 py-1"
            onChange={e => setV(x => ({ ...x, contrato: e.target.value }))}
            onBlur={save} />
        </label>
        <label className="flex items-center gap-1">CH sem.
          <input type="number" value={v.chSemanal} placeholder="h"
            className="ml-1 w-16 border rounded px-2 py-1"
            onChange={e => setV(x => ({ ...x, chSemanal: e.target.value }))}
            onBlur={save} />
        </label>
        <label className="flex items-center gap-1">Salário/mês R$
          <input type="number" value={v.salario} placeholder="0"
            className="ml-1 w-28 border rounded px-2 py-1"
            onChange={e => setV(x => ({ ...x, salario: e.target.value }))}
            onBlur={save} />
        </label>
      </div>
    </div>
  )
}

// ─── TaxaRow ──────────────────────────────────────────────────────────────────
interface TaxaRowProps {
  terapia: string;
  pa: number;
  diaria: number;
  onSavePA: (terapia: string, v: number) => void;
  onSaveDiaria: (terapia: string, v: number) => void;
}

export function TaxaRow({ terapia, pa, diaria, onSavePA, onSaveDiaria }: TaxaRowProps) {
  const [vPA, setPA]  = useState(String(pa ?? ''))
  const [vDia, setDia] = useState(String(diaria ?? ''))
  useEffect(() => setPA(String(pa ?? '')), [pa])
  useEffect(() => setDia(String(diaria ?? '')), [diaria])
  return (
    <div className="bg-white border rounded-lg px-3 py-2">
      <div className="text-sm font-medium mb-1.5" style={{ color: B.navy }}>{terapia}</div>
      <div className="flex gap-3 text-xs text-gray-500">
        <label className="flex items-center gap-1">PA R$/sessão
          <input type="number" min={0} step={0.01} value={vPA}
            className="ml-1 border rounded px-2 py-1 text-sm w-20"
            onChange={e => setPA(e.target.value)}
            onBlur={() => onSavePA(terapia, parseFloat(vPA) || 0)} />
        </label>
        <label className="flex items-center gap-1">PPD R$/dia
          <input type="number" min={0} step={1} value={vDia}
            className="ml-1 border rounded px-2 py-1 text-sm w-20"
            onChange={e => setDia(e.target.value)}
            onBlur={() => onSaveDiaria(terapia, parseFloat(vDia) || 0)} />
        </label>
      </div>
    </div>
  )
}

// ─── FeriadoRow ───────────────────────────────────────────────────────────────
interface FeriadoRowProps {
  feriado: { date: string; nome: string };
  idx: number;
  onChange: (idx: number, v: { date: string; nome: string }) => void;
  onRemove: (idx: number) => void;
}

export function FeriadoRow({ feriado, idx, onChange, onRemove }: FeriadoRowProps) {
  const [date, setDate] = useState(feriado.date || '')
  const [nome, setNome] = useState(feriado.nome || '')
  return (
    <div className="flex gap-2 items-center">
      <input type="date" value={date} className="border rounded px-2 py-1 text-sm"
        onChange={e => { setDate(e.target.value); onChange(idx, { date: e.target.value, nome }) }} />
      <input value={nome} placeholder="Nome" className="border rounded px-2 py-1 text-sm flex-1"
        onChange={e => { setNome(e.target.value); onChange(idx, { date, nome: e.target.value }) }} />
      <button onClick={() => onRemove(idx)} className="text-red-400 px-1">✕</button>
    </div>
  )
}

// ─── LimitInput ───────────────────────────────────────────────────────────────
interface LimitInputProps {
  prof: string;
  value: number | undefined;
  onSave: (prof: string, v: number) => void;
}

export function LimitInput({ prof, value, onSave }: LimitInputProps) {
  const [v, setV] = useState(String(value ?? DEFAULT_CC_LIM))
  useEffect(() => setV(String(value ?? DEFAULT_CC_LIM)), [value])
  return (
    <input type="number" min={1} max={30} value={v}
      className="w-16 text-center border rounded px-1 py-0.5 text-xs"
      onChange={e => setV(e.target.value)}
      onBlur={() => onSave(prof, parseInt(v) || DEFAULT_CC_LIM)} />
  )
}
