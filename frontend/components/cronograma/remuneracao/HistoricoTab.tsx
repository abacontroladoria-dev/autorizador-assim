"use client"

import { useState, useMemo, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Loader2, Save, Trash2, Calendar, TrendingUp } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { useAnaliseFutura } from "@/hooks/useRemuneracao"
import { getHistoricoSnapshots, saveHistoricoSnapshot, deleteHistoricoSnapshot } from "@/services/remuneracao.service"
import type { HistoricoSnapshot } from "@/types/remuneracao"
import { useHeader } from "@/contexts/HeaderContext"

const formatCurrency = (v: number | null) => {
  if (v === null || isNaN(v)) return "R$ 0,00"
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function HistoricoTab() {
  const { setHeader } = useHeader()
  const { resultado: dadosPorProf, presenca, loading: calcLoading } = useRemuneracaoRPContext()
  const { resultado: analiseFutura } = useAnaliseFutura()

  const [historico, setHistorico] = useState<HistoricoSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [profSel, setProfSel] = useState<string>("")

  const loadHistorico = async () => {
    setLoading(true)
    const { data } = await getHistoricoSnapshots()
    if (data) setHistorico(data as HistoricoSnapshot[])
    setLoading(false)
  }

  useEffect(() => {
    loadHistorico()
    setHeader("Painel de Remuneração", "Histórico Mensal")
  }, [setHeader])

  const handleSalvarSnapshot = async () => {
    if (!dadosPorProf || dadosPorProf.length === 0) {
      return alert("Nenhum dado calculado para salvar. Processe uma planilha na aba RP primeiro.")
    }

    const mesStr = window.prompt("Qual o mês de referência? (ex: 2026-07)")
    if (!mesStr) return

    setSaving(true)
    const projecaoPorProf = new Map((analiseFutura?.dadosPorProf ?? []).map(p => [p.prof, p]))
    const { data, error } = await saveHistoricoSnapshot({
      mes_ano: mesStr,
      dados: {
        presenca,
        profs: dadosPorProf.map(p => {
          const proj = projecaoPorProf.get(p.prof)
          return {
            prof: p.prof,
            totalReal: p.valorConfirmado,
            salAntigo: p.salAntigo,
            total100: proj?.total100 ?? null,
            totalX: proj?.totalX ?? null,
          }
        })
      }
    })
    
    if (error) {
      alert("Erro ao salvar: " + error.message)
    } else {
      alert("Retrato salvo com sucesso!")
      await loadHistorico()
    }
    setSaving(false)
  }

  const handleExcluir = async (id: string, mes: string) => {
    if (!window.confirm(`Deseja realmente excluir o histórico de ${mes}?`)) return
    
    await deleteHistoricoSnapshot(id)
    await loadHistorico()
  }

  // Lista de todos os profissionais que já apareceram em algum snapshot
  const allProfs = useMemo(() => {
    const set = new Set<string>()
    historico.forEach(s => {
      const profs = (s.dados as any)?.profs || []
      profs.forEach((p: any) => set.add(p.prof))
    })
    return Array.from(set).sort()
  }, [historico])

  // Prepara dados do gráfico
  const chartData = useMemo(() => {
    if (!profSel) return []
    
    // Sort chronological for chart
    const sortedH = [...historico].sort((a, b) => a.mes_ano.localeCompare(b.mes_ano))
    
    return sortedH.map(s => {
      const p = ((s.dados as any)?.profs || []).find((x: any) => x.prof === profSel)
      if (!p) return null
      
      return {
        mes: s.mes_ano,
        Real: p.totalReal ? Number(p.totalReal.toFixed(2)) : 0,
        Antigo: p.salAntigo ? Number(p.salAntigo) : undefined,
        Presenca100: p.total100 != null ? Number(p.total100.toFixed(2)) : undefined,
        PresencaConfig: p.totalX != null ? Number(p.totalX.toFixed(2)) : undefined,
      }
    }).filter(Boolean)
  }, [historico, profSel])

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-xl text-sm">
          <p className="font-bold mb-2 text-slate-800 dark:text-white">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-600 dark:text-slate-300 capitalize">{entry.name}:</span>
              <span className="font-bold" style={{ color: entry.color }}>
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight" style={{ color: B.navy }}>
            Histórico Mensal de Remuneração
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Compare a evolução dos ganhos e a efetividade dos contratos ao longo dos meses.
          </p>
        </div>
        
        <button
          onClick={handleSalvarSnapshot}
          disabled={saving || !dadosPorProf?.length || calcLoading}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all disabled:opacity-50"
          style={{ background: B.green }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar retrato deste mês
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : historico.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 flex flex-col items-center gap-3 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300" />
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-300">Nenhum retrato salvo</h3>
            <p className="text-sm max-w-md mx-auto mt-1">
              Calcule a planilha na aba Relacionamento Prestador e use o botão acima para salvar o primeiro mês.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: B.navy }} />
                  <h3 className="font-bold text-lg" style={{ color: B.navy }}>Evolução por Profissional</h3>
                </div>
                <select 
                  value={profSel} 
                  onChange={e => setProfSel(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm max-w-sm w-full outline-none focus:border-blue-500 transition-colors font-medium text-slate-700 dark:text-slate-300"
                >
                  <option value="">Selecione o profissional...</option>
                  {allProfs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {!profSel ? (
                <div className="h-[350px] flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                  Selecione um profissional para ver o gráfico de evolução
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                  Sem dados suficientes para este profissional
                </div>
              ) : (
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="mes" 
                        tick={{ fontSize: 12, fill: '#64748b' }} 
                        tickMargin={10} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <YAxis 
                        tickFormatter={v => `R$${(v/1000).toFixed(1)}k`} 
                        tick={{ fontSize: 12, fill: '#64748b' }} 
                        axisLine={false} 
                        tickLine={false}
                        tickMargin={10}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      
                      <Line 
                        type="monotone" 
                        dataKey="Real" 
                        name="Cenário Real (Confirmado)"
                        stroke={B.green} 
                        strokeWidth={3} 
                        dot={{ r: 4, strokeWidth: 2 }} 
                        activeDot={{ r: 6 }} 
                      />
                      
                      {chartData.some(d => d && d.Antigo !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="Antigo"
                          name="Salário Antigo (Ref)"
                          stroke={B.gray}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3 }}
                        />
                      )}

                      {chartData.some(d => d && d.Presenca100 !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="Presenca100"
                          name="100% Presença (Projeção)"
                          stroke={B.blue}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 3 }}
                        />
                      )}

                      {chartData.some(d => d && d.PresencaConfig !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="PresencaConfig"
                          name="Presença Configurada (Projeção)"
                          stroke={B.purple}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 3 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Retratos */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg" style={{ color: B.navy }}>Retratos Salvos</h3>
            
            <div className="space-y-3">
              {historico.map(s => {
                const profs = (s.dados as any)?.profs || []
                const presenca = (s.dados as any)?.presenca || 80
                
                return (
                  <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm transition-all hover:shadow-md hover:border-slate-300">
                    <div>
                      <div className="font-black text-lg text-slate-800 dark:text-white mb-1">
                        {s.mes_ano}
                      </div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {profs.length} Profissionais • {presenca}% pres.
                      </div>
                    </div>
                    <button 
                      onClick={() => handleExcluir(s.id, s.mes_ano)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Excluir Retrato"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
