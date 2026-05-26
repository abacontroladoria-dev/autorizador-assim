'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'

interface Props {
  includeCC?: boolean
}

export default function FilterBar({ includeCC = true }: Props) {
  const { busca, setBusca, filtrosEsp, setFiltrosEsp, allTerps } = useCalculadora()

  const filtroAtivo = (k: string) =>
    k === 'todos' ? filtrosEsp.includes('todos') || !filtrosEsp.length : filtrosEsp.includes(k)

  const toggleFiltro = (key: string) => {
    if (key === 'todos') { setFiltrosEsp(['todos']); return }
    setFiltrosEsp(cur => {
      const sem = cur.filter(x => x !== 'todos')
      return sem.includes(key) ? (sem.filter(x => x !== key) || ['todos']) : [...sem, key]
    })
  }

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar profissional..."
            className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm"
            style={{ borderColor: '#d1d5db' }}
          />
        </div>
        {busca && (
          <button onClick={() => setBusca('')} className="text-xs text-gray-400">✕ limpar</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-400 mr-1">Especialidade:</span>
        {[
          { k: 'todos', l: 'Todos' },
          { k: 'AE', l: 'ABA (AE)' },
          { k: 'TA', l: 'Terapia Alimentar' },
          ...(includeCC ? [{ k: 'CC', l: 'Coord. Caso' }] : []),
        ].map(({ k, l }) => (
          <button
            key={k}
            onClick={() => toggleFiltro(k)}
            className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
            style={{
              background: filtroAtivo(k) ? B.navy : '#fff',
              color: filtroAtivo(k) ? '#fff' : B.navy,
              borderColor: B.navy,
            }}
          >
            {l}
          </button>
        ))}
        <select
          value=""
          onChange={e => { if (e.target.value) toggleFiltro(e.target.value) }}
          className="border rounded-full px-3 py-1 text-xs"
          style={{ color: B.navy }}
        >
          <option value="">+ Outra especialidade</option>
          {allTerps.map(t => (
            <option key={t} value={t}>{filtrosEsp.includes(t) ? '✓ ' : ''}{t}</option>
          ))}
        </select>
        {filtrosEsp.filter(f => !['todos', 'AE', 'TA', 'CC'].includes(f)).map(f => (
          <span
            key={f}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: B.blue }}
          >
            {f}
            <button onClick={() => toggleFiltro(f)} className="ml-0.5 opacity-70 hover:opacity-100">✕</button>
          </span>
        ))}
      </div>
    </div>
  )
}
