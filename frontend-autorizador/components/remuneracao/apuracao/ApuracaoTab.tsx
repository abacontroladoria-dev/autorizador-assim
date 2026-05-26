'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'
import { fmt } from '../lib/helpers'
import ProfCardRemun from './ProfCardRemun'

export default function ApuracaoTab() {
  const {
    evoRows, evoFileRef, remuneracaoReal, remBusca, setRemBusca,
    remProfs, setRemProfs, remEspFiltro, setRemEspFiltro,
    remFiltroRapido, setRemFiltroRapido, remProfissionais,
    remResumo, remMes, evoName, expandido, setExpandido, exportarRemuneracao,
  } = useCalculadora()

  if (!evoRows.length) return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">📑</div>
      <div className="font-bold text-lg mb-1" style={{ color: B.navy }}>
        Importe o relatório de evolução detalhada
      </div>
      <div className="text-sm text-gray-400 mb-4">analise_evolucao_detalhada_… .xls/.xlsx</div>
      <button
        onClick={() => evoFileRef.current?.click()}
        className="px-6 py-3 rounded-xl font-bold text-white text-sm"
        style={{ background: B.blue }}
      >
        Selecionar relatório XLS
      </button>
    </div>
  )

  const allEsps = [...new Set(remuneracaoReal.flatMap(p => p.sessoes.map(s => s.especialidade).filter(Boolean)))].sort()
  const q = remBusca.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const normQ = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

  const profsTela = remuneracaoReal.filter(p => {
    if (remProfs.length && !remProfs.includes(p.prof)) return false
    if (remEspFiltro.length && !p.sessoes.some(s => remEspFiltro.includes(s.especialidade))) return false
    if (remFiltroRapido === 'pendentes' && p.pendentes === 0) return false
    if (remFiltroRapido === 'inconsistencias' && p.inconsistencias === 0) return false
    if (remFiltroRapido === 'semcontrato' && p.temAntigo) return false
    if (remFiltroRapido === 'comvalor' && p.valorConfirmado === 0) return false
    if (q && !normQ(p.prof).includes(q) &&
      !p.sessoes.some(s => normQ(`${s.paciente} ${s.especialidade} ${s.data} ${s.hora}`).includes(q))) return false
    return true
  })

  const rankPerf = remuneracaoReal.filter(p => p.agendadas > 0).map(p => ({
    ...p,
    pctEv: (p.agendadas - p.canceladas) > 0
      ? ((p.evoluidasProprias + p.substituicoesRealizadas) / (p.agendadas - p.canceladas)) * 100
      : 0,
  }))
  const melhor = [...rankPerf].sort((a, b) => b.pctEv - a.pctEv || b.agendadas - a.agendadas)[0]
  const atencao = [...rankPerf].sort((a, b) => a.pctEv - b.pctEv || b.pendentes - a.pendentes)[0]

  return (
    <>
      <div className="flex justify-between items-start gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="font-bold text-lg" style={{ color: B.navy }}>
            💼 Remuneração — RP · {remMes}
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded"
              style={{ background: '#fef3c7', color: '#92400e' }}>🔒 Uso interno</span>
          </h2>
          <div className="text-xs text-gray-400">
            Base: {evoName} · {evoRows.length.toLocaleString('pt-BR')} registros
          </div>
        </div>
        <button onClick={exportarRemuneracao}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: B.green }}>
          📤 Exportar XLSX
        </button>
      </div>

      {/* KPIs gerenciais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl px-4 py-3" style={{ background: B.limeLt }}>
          <div className="text-xs text-gray-500">% geral de evolução</div>
          <div className="text-2xl font-bold" style={{ color: B.green }}>{remResumo.pct.toFixed(1).replace('.', ',')}%</div>
          <div className="text-[11px] text-gray-400">Base: evoluídos + não evoluídos</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: B.blueLt }}>
          <div className="text-xs text-gray-500">Total de agendamentos</div>
          <div className="text-2xl font-bold" style={{ color: B.blue }}>{remResumo.total.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: B.navyLt }}>
          <div className="text-xs text-gray-500">Presença Órbita</div>
          <div className="text-2xl font-bold" style={{ color: B.navy }}>{remResumo.presencaOrb.toLocaleString('pt-BR')}</div>
          <div className="text-[11px] text-gray-400">compareceu = Sim</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: remResumo.inc > 0 ? '#fff5f5' : '#fff' }}>
          <div className="text-xs text-gray-500">Inconsistências</div>
          <div className="text-2xl font-bold" style={{ color: remResumo.inc > 0 ? B.red : B.gray }}>{remResumo.inc}</div>
          <div className="text-[11px] text-gray-400">evol. sem presença / cancelado evoluído</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white">
          <div className="text-xs text-gray-500">Evoluídos</div>
          <div className="text-2xl font-bold" style={{ color: B.green }}>{remResumo.evoluidos.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white">
          <div className="text-xs text-gray-500">Substituições</div>
          <div className="text-2xl font-bold" style={{ color: B.blue }}>{remResumo.subs.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: B.amberLt }}>
          <div className="text-xs text-gray-500">Não evoluídos</div>
          <div className="text-2xl font-bold" style={{ color: B.amber }}>{remResumo.naoEvoluidos.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white">
          <div className="text-xs text-gray-500">Cancelados</div>
          <div className="text-2xl font-bold" style={{ color: B.gray }}>{remResumo.cancelados.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white">
          <div className="text-xs text-gray-500">Total modelo antigo</div>
          <div className="text-xl font-bold" style={{ color: B.gray }}>{fmt(remResumo.totalAntigo)}</div>
        </div>
        <div className="rounded-xl px-4 py-3 col-span-2" style={{ background: B.limeLt, borderLeft: `3px solid ${B.green}` }}>
          <div className="text-xs text-gray-500">Remuneração real confirmada</div>
          <div className="text-xl font-bold" style={{ color: B.green }}>{fmt(remResumo.valorConfirmado)}</div>
          <div className="text-[11px] text-gray-400">evoluções próprias + substituições + PPD + PME CC</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: B.blueLt, borderLeft: `3px solid ${B.blue}` }}>
          <div className="text-xs text-gray-500">Potencial após regularização</div>
          <div className="text-xl font-bold" style={{ color: B.blue }}>{fmt(remResumo.valorPotencial)}</div>
        </div>
      </div>

      {/* Contratos pendentes */}
      {remResumo.pendContr > 0 && (
        <div className="mb-4 rounded-xl overflow-hidden" style={{ background: '#fff5f5', border: '1px solid #fecaca' }}>
          <button className="w-full px-4 py-3 flex justify-between items-center text-left"
            onClick={() => setExpandido(e => ({
              ...e, remun_pend_contr: e.remun_pend_contr === 'open' ? null : 'open',
            }))}>
            <span className="font-semibold text-sm" style={{ color: B.red }}>
              ⚠️ {remResumo.pendContr} profissional(is) sem dados de contrato antigo
            </span>
            <span className="text-xs" style={{ color: B.red }}>
              {expandido.remun_pend_contr === 'open' ? '▲ Ocultar' : '▼ Ver lista'}
            </span>
          </button>
          {expandido.remun_pend_contr === 'open' && (
            <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {remResumo.pendContrato.map(p => (
                <div key={p.prof} className="text-xs py-1 flex justify-between">
                  <span style={{ color: B.navy }}>{p.prof}</span>
                  <span className="text-gray-400">{p.contrato || 'sem contrato'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Melhor / Atenção */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {melhor && (
          <div className="rounded-xl p-4 bg-white shadow-sm" style={{ borderLeft: `4px solid ${B.green}` }}>
            <div className="text-xs text-gray-500 mb-1">🏆 Melhor desempenho</div>
            <div className="font-bold text-sm" style={{ color: B.navy }}>{melhor.prof}</div>
            <div className="text-xs text-gray-500 mt-1">
              {melhor.pctEv.toFixed(1)}% · {melhor.agendadas} agendadas · {melhor.evoluidasProprias} evoluídas · {melhor.substituicoesRealizadas} substituições
            </div>
          </div>
        )}
        {atencao && atencao.prof !== melhor?.prof && (
          <div className="rounded-xl p-4 bg-white shadow-sm" style={{ borderLeft: `4px solid ${B.red}` }}>
            <div className="text-xs text-gray-500 mb-1">⚠️ Ponto de atenção</div>
            <div className="font-bold text-sm" style={{ color: B.navy }}>{atencao.prof}</div>
            <div className="text-xs text-gray-500 mt-1">
              {atencao.pctEv.toFixed(1)}% · {atencao.agendadas} agendadas · {atencao.pendentes} pendentes · {atencao.substituidoPorOutro} cedidas
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="rounded-xl bg-white shadow-sm p-3 mb-4 space-y-2">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input value={remBusca} onChange={e => setRemBusca(e.target.value)}
              placeholder="Buscar profissional, paciente, data..."
              className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
          </div>
          <button onClick={() => { setRemBusca(''); setRemProfs([]); setRemEspFiltro([]); setRemFiltroRapido('todos') }}
            className="px-3 py-2 rounded-lg text-xs font-semibold border" style={{ color: B.navy }}>
            ✕ Limpar tudo
          </button>
        </div>

        {/* Multi-select profissionais */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium flex-shrink-0">👤 Profissionais:</span>
          {remProfs.map(p => (
            <span key={p} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: B.navy, color: '#fff' }}>
              {p}
              <button onClick={() => setRemProfs(ps => ps.filter(x => x !== p))} className="ml-1 opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
          <select value="" onChange={e => { if (e.target.value && !remProfs.includes(e.target.value)) setRemProfs(ps => [...ps, e.target.value]) }}
            className="border rounded-lg px-2 py-1 text-xs min-w-[180px]">
            <option value="">{remProfs.length === 0 ? 'Todos os profissionais' : '+ Adicionar profissional'}</option>
            {remProfissionais.filter(p => !remProfs.includes(p)).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Filter by especialidade */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium flex-shrink-0">🏷️ Especialidade:</span>
          {remEspFiltro.map(e => (
            <span key={e} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: B.blue, color: '#fff' }}>
              {e}
              <button onClick={() => setRemEspFiltro(es => es.filter(x => x !== e))} className="ml-1 opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
          <select value="" onChange={e => { if (e.target.value && !remEspFiltro.includes(e.target.value)) setRemEspFiltro(es => [...es, e.target.value]) }}
            className="border rounded-lg px-2 py-1 text-xs min-w-[180px]">
            <option value="">{remEspFiltro.length === 0 ? 'Todas as especialidades' : '+ Adicionar especialidade'}</option>
            {allEsps.filter(e => !remEspFiltro.includes(e)).map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400">Filtro rápido:</span>
          {[
            { k: 'todos', l: 'Todos' },
            { k: 'pendentes', l: '⚠️ Com sem-registro' },
            { k: 'inconsistencias', l: '❗ Inconsistências' },
            { k: 'semcontrato', l: '❓ Sem contrato antigo' },
            { k: 'comvalor', l: '💰 Com valor a receber' },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => setRemFiltroRapido(k)}
              className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
              style={{
                background: remFiltroRapido === k ? B.navy : '#fff',
                color: remFiltroRapido === k ? '#fff' : B.navy,
                borderColor: B.navy,
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-0">
        {profsTela.map(p => <ProfCardRemun key={p.prof} p={p} modoRP={true} />)}
        {!profsTela.length && (
          <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">
            Nenhum profissional encontrado.
          </div>
        )}
      </div>
    </>
  )
}
