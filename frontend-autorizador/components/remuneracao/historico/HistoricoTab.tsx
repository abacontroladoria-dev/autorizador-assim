'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend, Line,
} from 'recharts'
import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'
import { fmt } from '../lib/helpers'

export default function HistoricoTab() {
  const { historico, setHistorico, salvarSnapshot, dadosPorProf, presenca } = useCalculadora()
  const [profSel, setProfSel] = useState('')

  const allH = useMemo(
    () => [...new Set(historico.flatMap(s => s.profs.map(p => p.prof)))].sort(),
    [historico]
  )

  const chartData = useMemo(() => {
    if (!profSel) return []
    return historico.map(s => {
      const p = s.profs.find(x => x.prof === profSel)
      if (!p) return null
      return {
        mes: s.mesStr || String(s.id).slice(-6),
        '100%': +p.total100.toFixed(2),
        [`${s.presenca || 80}%`]: +p.totalX.toFixed(2),
        ...(p.salAntigo ? { Antigo: p.salAntigo } : {}),
      }
    }).filter(Boolean)
  }, [historico, profSel])

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-lg" style={{ color: B.navy }}>Histórico Mensal</h2>
        <button
          onClick={salvarSnapshot}
          disabled={!dadosPorProf.length}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
          style={{ background: B.green }}
        >
          💾 Salvar retrato deste mês
        </button>
      </div>

      {!historico.length && (
        <div className="text-center py-12 text-gray-400 text-sm">Nenhum retrato salvo.</div>
      )}

      {historico.length > 0 && (
        <>
          <select
            value={profSel}
            onChange={e => setProfSel(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm mb-4 w-full max-w-sm"
          >
            <option value="">Selecione profissional para gráfico</option>
            {allH.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {chartData.length > 0 && (
            <div className="bg-white border rounded-xl p-4 mb-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `R$${(Number(v) / 1000).toFixed(1)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="100%" stroke={B.green} strokeWidth={2} dot />
                  {chartData.some(d => Object.keys(d as object).some(k => k.endsWith('%') && k !== '100%')) && (
                    <Line type="monotone" dataKey={`${historico[0]?.presenca || 80}%`} stroke={B.blue} strokeWidth={2} dot />
                  )}
                  {chartData.some(d => (d as Record<string,unknown>).Antigo) && (
                    <Line type="monotone" dataKey="Antigo" stroke={B.gray} strokeWidth={1} strokeDasharray="5 5" dot />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="space-y-2">
            {historico.slice().reverse().map(s => (
              <div key={s.id} className="bg-white border rounded-xl px-4 py-3 flex justify-between items-center">
                <div>
                  <span className="font-bold" style={{ color: B.navy }}>{s.mesStr}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {s.profs.length} profissionais · {s.presenca || 80}% presença
                  </span>
                </div>
                <button
                  onClick={() => setHistorico(h => h.filter(x => x.id !== s.id))}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
