'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B, TAXAS_PA_PADRAO, CONTRATOS_ANTIGOS, FERIADOS_BR } from '../lib/constants'
import NumInput from '../shared/NumInput'
import { ContractRow, TaxaRow, FeriadoRow } from './FormRows'

export default function ConfigTab() {
  const {
    presenca, setPresenca, ccPA, setCcPA, ccPME, setCcPME, etaBonus, setEtaBonus,
    taxasPA, setTaxasPA, diarias, setDiarias, antigos, setAntigos,
    extraHols, setExtraHols, dadosPorProf, configSub, setConfigSub,
  } = useCalculadora()

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[['geral', '⚙️ Geral'], ['taxas', '💰 PA + PPD'], ['contratos', '📋 Contratos'], ['feriados', '📅 Feriados']].map(([k, l]) => (
          <button key={k} onClick={() => setConfigSub(k)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: configSub === k ? B.navy : '#f3f4f6', color: configSub === k ? '#fff' : B.navy }}>
            {l}
          </button>
        ))}
      </div>

      {configSub === 'geral' && (
        <div className="space-y-3 max-w-md">
          <div className="bg-white border rounded-xl p-4">
            <label className="block text-sm font-bold mb-1" style={{ color: B.navy }}>Taxa de Presença Projetada (%)</label>
            <NumInput value={presenca} min={1} max={100} step={1}
              className="w-20 border rounded-lg px-3 py-2 text-sm" onSave={v => setPresenca(v)} />
            <p className="text-xs text-gray-400 mt-1">Padrão: 80%. Afeta PA mas NÃO a diária.</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <label className="block text-sm font-bold mb-1" style={{ color: B.purple }}>Coordenador de Caso — PA (R$/atendimento)</label>
            <NumInput value={ccPA} min={0} step={0.01}
              className="w-28 border rounded-lg px-3 py-2 text-sm" onSave={v => setCcPA(v)} />
          </div>
          <div className="bg-white border rounded-xl p-4">
            <label className="block text-sm font-bold mb-1" style={{ color: B.purple }}>Coordenador de Caso — PME (R$/paciente único/mês)</label>
            <NumInput value={ccPME} min={0} step={0.01}
              className="w-28 border rounded-lg px-3 py-2 text-sm" onSave={v => setCcPME(v)} />
            <p className="text-xs text-gray-400 mt-1">PME é fixo por mês — não afetado por % presença.</p>
          </div>
          <div className="bg-white border rounded-xl p-4" style={{ borderLeft: `3px solid ${B.orange}` }}>
            <label className="block text-sm font-bold mb-1" style={{ color: B.orange }}>🏷️ Especialista Técnico de Área — Bônus ETA (R$/semana)</label>
            <NumInput value={etaBonus} min={0} step={1}
              className="w-28 border rounded-lg px-3 py-2 text-sm" onSave={v => setEtaBonus(v)} />
            <p className="text-xs text-gray-400 mt-1">
              Pago uma vez por semana que a ETA trabalha nessa função, independente do nº de horas/dias.
              NÃO afetado por % de presença.
            </p>
          </div>
        </div>
      )}

      {configSub === 'taxas' && (
        <div>
          <p className="text-sm text-gray-500 mb-1">PA = valor por sessão de 40min com paciente real.</p>
          <p className="text-sm text-gray-500 mb-2">PPD (Pagamento por Disponibilidade) = valor por dia escalado.</p>
          <div className="mb-3 p-3 rounded-xl text-xs" style={{ background: '#fff7ed', border: `1px solid ${B.orange}` }}>
            <strong style={{ color: B.orange }}>🏷️ ETA (Especialista Técnico de Área):</strong>
            {' '}PA R$50/sessão + PPD R$350/dia + Bônus ETA R${etaBonus}/semana.
            O bônus ETA é configurável em <em>⚙️ Geral</em>. PA e PPD são editáveis abaixo.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.keys(TAXAS_PA_PADRAO).filter(t => t !== 'Coordenador de Caso').map(t => (
              <TaxaRow key={t} terapia={t} pa={taxasPA[t] ?? 0} diaria={diarias[t] ?? 0}
                onSavePA={(terp, v) => setTaxasPA(x => ({ ...x, [terp]: v }))}
                onSaveDiaria={(terp, v) => setDiarias(x => ({ ...x, [terp]: v }))} />
            ))}
          </div>
        </div>
      )}

      {configSub === 'contratos' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">Dados pré-carregados. Salva ao sair do campo.</p>
          {!dadosPorProf.length && (
            <p className="italic text-gray-400 text-sm mb-2">Importe um CSV para ver os profissionais.</p>
          )}
          <div className="space-y-2">
            {dadosPorProf.map(d => {
              const cur = { ...CONTRATOS_ANTIGOS[d.prof as keyof typeof CONTRATOS_ANTIGOS], ...(antigos[d.prof] || {}) }
              return (
                <ContractRow key={d.prof} prof={d.prof} initial={cur}
                  onSave={(p, v) => setAntigos(a => ({ ...a, [p]: v }))} />
              )
            })}
          </div>
        </div>
      )}

      {configSub === 'feriados' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">Feriados municipais/estaduais (além dos nacionais já incluídos).</p>
          <div className="space-y-2 mb-3">
            {extraHols.map((h, i) => (
              <FeriadoRow key={i} feriado={h} idx={i}
                onChange={(idx, v) => setExtraHols(hs => hs.map((x, j) => j === idx ? v : x))}
                onRemove={idx => setExtraHols(hs => hs.filter((_, j) => j !== idx))} />
            ))}
          </div>
          <button
            onClick={() => setExtraHols(hs => [...hs, { date: '', nome: '' }])}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: B.blue }}
          >
            + Adicionar feriado
          </button>
          <div className="mt-4 rounded-lg p-3 text-xs" style={{ background: B.navyLt }}>
            <strong>Feriados nacionais 2026:</strong>{' '}
            {Object.entries(FERIADOS_BR)
              .filter(([k]) => k.startsWith('2026'))
              .map(([k, v]) => (
                <span key={k} className="inline-block mr-3">{k.slice(5)}: {v}</span>
              ))}
          </div>
        </div>
      )}
    </>
  )
}
