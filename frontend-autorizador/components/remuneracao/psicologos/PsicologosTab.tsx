'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'
import { fmt } from '../lib/helpers'
import FilterBar from '../shared/FilterBar'
import { LimitInput } from '../config/FormRows'
import ProfCard from '../analise/ProfCard'

export default function PsicologosTab() {
  const { rows, dadosFiltrados, ccPA, ccPME, presenca, limites, setLimites } = useCalculadora()

  if (!rows.length) return (
    <p className="text-gray-400 text-sm py-4">Importe um CSV primeiro.</p>
  )

  const ccs = dadosFiltrados.filter(d => d.hasCC)

  return (
    <>
      <FilterBar includeCC={false} />

      <div className="mb-3 rounded-lg p-3 text-xs" style={{ background: B.purpleLt, color: B.purple }}>
        <strong>Fórmula Psicólogo Analista (CC):</strong>{' '}
        Total = (sessões/mês × PA R${ccPA.toFixed(2)}) + (pac. únicos × PME R${ccPME.toFixed(2)})
        <span className="ml-2 text-gray-400">— PME fixo, não afetado por % presença</span>
      </div>

      <div className="overflow-x-auto rounded-xl shadow-sm mb-4">
        <table className="w-full text-sm bg-white">
          <thead style={{ background: B.purpleLt }}>
            <tr>
              {[
                'Profissional', 'Contrato', 'Sess/sem', 'Pac. únicos', 'Teto', 'Alerta',
                'PA 100%', `PA ${presenca}%`, 'PME', 'Total 100%', `Total ${presenca}%`, 'Limite exc.',
              ].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold text-xs whitespace-nowrap"
                  style={{ color: B.purple }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ccs.map(d => {
              const cc = d.terapiaDetails.find(t => t.isCC)
              return (
                <tr key={d.prof} className="border-b" style={{ background: d.alertaCC ? '#fff5f5' : '#fff' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: B.navy }}>{d.prof}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{d.contrato || '—'}</td>
                  <td className="px-3 py-2">{cc?.sessoes || 0}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: d.alertaCC ? B.red : B.navy }}>{d.pacCC}</td>
                  <td className="px-3 py-2">{d.limiteCC}</td>
                  <td className="px-3 py-2">
                    {d.alertaCC
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: '#ffe0e0', color: B.red }}>+{d.pacCC - d.limiteCC}</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: B.limeLt, color: B.green }}>✓ OK</span>
                    }
                  </td>
                  <td className="px-3 py-2" style={{ color: B.green }}>{fmt(cc?.monthly100 || 0)}</td>
                  <td className="px-3 py-2" style={{ color: B.blue }}>{fmt(cc?.monthlyX || 0)}</td>
                  <td className="px-3 py-2" style={{ color: B.purple }}>{fmt(d.pme)}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: B.green }}>{fmt(d.total100)}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: B.blue }}>{fmt(d.totalX)}</td>
                  <td className="px-3 py-2">
                    <LimitInput prof={d.prof} value={limites[d.prof]}
                      onSave={(p, v) => setLimites(l => ({ ...l, [p]: v }))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {ccs.map(d => <ProfCard key={d.prof} d={d} />)}
    </>
  )
}
