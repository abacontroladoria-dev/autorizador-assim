'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B, DOW_PT } from '../lib/constants'
import { fmt } from '../lib/helpers'
import FilterBar from '../shared/FilterBar'
import ProfCard from './ProfCard'

export default function AnaliseTab() {
  const {
    rows, dadosFiltrados, dadosPorProf, feriadosMes,
    mesSelecionado, setMesSelecionado, loadingGrade,
    presenca, analSort, setAnalSort, exportarAnalise, analMes,
  } = useCalculadora()

  const tot100 = dadosFiltrados.reduce((s, d) => s + d.total100, 0)
  const totX = dadosFiltrados.reduce((s, d) => s + d.totalX, 0)
  const alerts = dadosPorProf.filter(d => d.alertaCC).length
  const totalAntigo = dadosFiltrados.filter(d => d.temAntigo).reduce((s, d) => s + (d.salAntigo || 0), 0)
  const pendContr = dadosFiltrados.filter(d => !d.temAntigo).length

  const sorted = [...dadosFiltrados].sort((a, b) => {
    if (analSort === 'delta_desc') {
      if (a.delta100 === null && b.delta100 === null) return a.prof.localeCompare(b.prof)
      if (a.delta100 === null) return 1
      if (b.delta100 === null) return -1
      return b.delta100 - a.delta100
    }
    if (analSort === 'delta_asc') {
      if (a.delta100 === null && b.delta100 === null) return a.prof.localeCompare(b.prof)
      if (a.delta100 === null) return 1
      if (b.delta100 === null) return -1
      return a.delta100 - b.delta100
    }
    return a.prof.localeCompare(b.prof)
  })

  return (
    <>
      {/* Cabeçalho com seletor de mês */}
      <div className="flex justify-between items-start gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="font-bold text-lg" style={{ color: B.navy }}>
            Análise Futura de Projeção Mensal{analMes ? ` — ${analMes}` : ''}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <label className="text-xs text-gray-500">Mês:</label>
            <input
              type="month"
              value={mesSelecionado}
              onChange={e => setMesSelecionado(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm"
              style={{ borderColor: B.blue, color: B.navy }}
            />
            {loadingGrade && (
              <span className="text-xs text-gray-400 animate-pulse">Carregando grade…</span>
            )}
            {!loadingGrade && rows.length > 0 && (
              <span className="text-xs text-gray-400">{rows.length} slots · projeção por dias úteis reais</span>
            )}
          </div>
        </div>
        <button
          onClick={exportarAnalise}
          disabled={!dadosFiltrados.length}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
          style={{ background: B.green }}
        >
          📤 Exportar XLSX da análise
        </button>
      </div>

      {/* Estado de carregamento */}
      {loadingGrade && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3 animate-spin inline-block">⏳</div>
          <div className="text-sm">Buscando grade de profissionais…</div>
        </div>
      )}

      {/* Sem dados para o mês */}
      {!loadingGrade && !rows.length && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <div className="font-bold text-base mb-1" style={{ color: B.navy }}>
            Sem dados para {mesSelecionado}
          </div>
          <div className="text-sm">
            A grade de profissionais ainda não tem registros para esse mês.
          </div>
        </div>
      )}

      {/* Conteúdo principal */}
      {!loadingGrade && rows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl px-4 py-3" style={{ background: B.blueLt }}>
              <div className="text-xs text-gray-500">Exibindo</div>
              <div className="text-2xl font-bold" style={{ color: B.blue }}>{dadosFiltrados.length}</div>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: B.limeLt }}>
              <div className="text-xs text-gray-500">Total 100% / mês</div>
              <div className="text-xl font-bold" style={{ color: B.green }}>{fmt(tot100)}</div>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: B.blueLt }}>
              <div className="text-xs text-gray-500">Total {presenca}% / mês</div>
              <div className="text-xl font-bold" style={{ color: B.blue }}>{fmt(totX)}</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-white">
              <div className="text-xs text-gray-500">Total modelo contr. antigo</div>
              <div className="text-xl font-bold" style={{ color: B.gray }}>{fmt(totalAntigo)}</div>
              <div className="text-xs text-gray-400">Apenas quem tem dados cadastrados</div>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: pendContr > 0 ? '#fff5f5' : '#fff' }}>
              <div className="text-xs text-gray-500">Dados contratuais pendentes</div>
              <div className="text-2xl font-bold" style={{ color: pendContr > 0 ? B.red : B.gray }}>{pendContr}</div>
              <div className="text-xs text-gray-400">sem salário antigo cadastrado</div>
            </div>
            {alerts > 0 && (
              <div className="rounded-xl px-4 py-3" style={{ background: '#fff5f5' }}>
                <div className="text-xs text-gray-500">Alertas CC</div>
                <div className="text-2xl font-bold" style={{ color: B.red }}>⚠️ {alerts}</div>
              </div>
            )}
          </div>

          {/* Feriados */}
          {feriadosMes.length > 0 && (
            <div className="mb-3 rounded-xl px-4 py-2 text-xs" style={{ background: '#fff8e1', color: '#92400e' }}>
              ⚠️ Feriados no mês:{' '}
              {feriadosMes.map(f => (
                <span key={f.date} className="font-semibold mr-2">
                  {f.date.slice(5)} {f.nome} ({DOW_PT[f.dow as keyof typeof DOW_PT]})
                </span>
              ))}
            </div>
          )}

          <FilterBar includeCC={true} />

          {/* Ordenação */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Ordenar por:</span>
            {[
              { k: 'alpha', l: 'A–Z' },
              { k: 'delta_desc', l: '↑ Maior % vs antigo' },
              { k: 'delta_asc', l: '↓ Menor % vs antigo (prioritário)' },
            ].map(({ k, l }) => (
              <button
                key={k}
                onClick={() => setAnalSort(k)}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                style={{
                  background: analSort === k ? B.navy : '#fff',
                  color: analSort === k ? '#fff' : B.navy,
                  borderColor: B.navy,
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {sorted.length === 0 && <p className="text-gray-400 text-sm">Nenhum resultado.</p>}
          {sorted.map(d => <ProfCard key={d.prof} d={d} />)}
        </>
      )}
    </>
  )
}
