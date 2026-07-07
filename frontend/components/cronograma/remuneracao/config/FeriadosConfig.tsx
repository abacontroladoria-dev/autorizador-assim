"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Save, Trash2, Calendar } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { updateRemuneracaoConfig } from "@/services/remuneracao.service"
import type { FeriadoInfo } from "@/types/remuneracao"

export function FeriadosConfig() {
  const { config, loading: configLoading } = useRemuneracaoConfig()
  
  const [feriados, setFeriados] = useState<Record<string, FeriadoInfo>>({})
  const [saving, setSaving] = useState(false)
  
  // Para adicionar novo
  const [novaData, setNovaData] = useState("")
  const [novoNome, setNovoNome] = useState("")
  const [novoTipo, setNovoTipo] = useState<"integral" | "parcial">("integral")

  useEffect(() => {
    if (config?.feriados) {
      setFeriados(config.feriados)
    }
  }, [config])

  const handleSaveAll = async () => {
    if (!config) return
    setSaving(true)
    const ok = await updateRemuneracaoConfig(config.id, { feriados })
    setSaving(false)
    if (ok) {
      alert("Feriados atualizados com sucesso!")
    } else {
      alert("Erro ao salvar feriados.")
    }
  }

  const handleAdd = () => {
    if (!novaData || !novoNome) return alert("Preencha a data e o nome.")
    setFeriados(prev => ({
      ...prev,
      [novaData]: { nome: novoNome, tipo: novoTipo }
    }))
    setNovaData("")
    setNovoNome("")
    setNovoTipo("integral")
  }

  const handleRemove = (data: string) => {
    const next = { ...feriados }
    delete next[data]
    setFeriados(next)
  }

  if (configLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
  }

  const sortedDates = Object.keys(feriados).sort()

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg" style={{ color: B.navy }}>Feriados Estaduais / Municipais</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            O sistema já desconta os feriados nacionais automaticamente. Adicione aqui apenas os feriados regionais que afetam a operação da clínica.
          </p>
        </div>
        
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white shadow-sm transition-all disabled:opacity-50"
          style={{ background: B.blue }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Feriados
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Data (YYYY-MM-DD)</label>
            <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nome do Feriado</label>
            <input type="text" placeholder="Ex: Dia das Bruxas" value={novoNome} onChange={e => setNovoNome(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tipo</label>
            <select value={novoTipo} onChange={e => setNovoTipo(e.target.value as any)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="integral">Integral (O dia todo)</option>
              <option value="parcial">Parcial (Meio período)</option>
            </select>
          </div>
          <div className="col-span-12 md:col-span-2 flex items-end">
            <button onClick={handleAdd} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold px-4 py-2 rounded-lg">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {sortedDates.length === 0 ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <Calendar className="w-8 h-8 text-slate-300" />
            <p>Nenhum feriado local configurado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDates.map(date => {
              const f = feriados[date]
              return (
                <div key={date} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {f.nome}
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${f.tipo === 'integral' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                        {f.tipo}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 font-mono mt-0.5">{date}</div>
                  </div>
                  <button onClick={() => handleRemove(date)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
