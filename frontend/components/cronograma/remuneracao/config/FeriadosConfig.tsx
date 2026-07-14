"use client"

import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, Plus, Save, Trash2, Calendar } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { useRemuneracaoConfig, refetchRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { updateRemuneracaoConfig } from "@/services/remuneracao.service"
import type { FeriadoInfo } from "@/types/remuneracao"

const HORARIO_DIA_COMPLETO = { inicio: "08:00", fim: "17:40" }

const TIPO_LABEL: Record<"integral" | "parcial", string> = {
  integral: "Dia completo",
  parcial: "Parcial",
}

function horarioLabel(f: FeriadoInfo): string | null {
  if (f.tipo === "integral") return `${HORARIO_DIA_COMPLETO.inicio} - ${HORARIO_DIA_COMPLETO.fim}`
  const inicio = f.horario_inicio ?? f.parcial_a_partir
  const fim = f.horario_fim
  if (!inicio && !fim) return null
  return `${inicio ?? "—"} - ${fim ?? "—"}`
}

interface FeriadosConfigProps {
  onDirtyChange?: (dirty: boolean) => void
  registerSave?: (save: (() => Promise<boolean>) | null) => void
}

export function FeriadosConfig({ onDirtyChange, registerSave }: FeriadosConfigProps = {}) {
  const { config, loading: configLoading } = useRemuneracaoConfig()

  // Inicializa direto de "config" quando ele já está disponível/em cache no
  // primeiro render (aba Feriados quase sempre monta depois da Config já ter
  // buscado os dados) — se começasse vazio, o bloco de resync abaixo nunca
  // dispararia (a referência de config não muda depois do mount) e a lista
  // apareceria vazia mesmo com os feriados intactos no banco.
  const [feriados, setFeriados] = useState<Record<string, FeriadoInfo>>(config?.feriados ?? {})
  const [saving, setSaving] = useState(false)
  const [savedFeriados, setSavedFeriados] = useState<Record<string, FeriadoInfo>>(config?.feriados ?? {})

  // Para adicionar novo
  const [novaData, setNovaData] = useState("")
  const [novoNome, setNovoNome] = useState("")
  const [novoTipo, setNovoTipo] = useState<"integral" | "parcial">("integral")
  const [novoInicio, setNovoInicio] = useState(HORARIO_DIA_COMPLETO.inicio)
  const [novoFim, setNovoFim] = useState(HORARIO_DIA_COMPLETO.fim)

  // Ressincroniza com "config" assíncrono quando ele chega/muda depois do mount
  // (ex.: primeiro carregamento "frio", antes do fetch resolver) — padrão
  // recomendado do React para ajustar estado a partir de props sem efeito.
  const [prevConfig, setPrevConfig] = useState(config)
  if (config?.feriados && config !== prevConfig) {
    setPrevConfig(config)
    setFeriados(config.feriados)
    setSavedFeriados(config.feriados)
  }

  const isDirty = JSON.stringify(feriados) !== JSON.stringify(savedFeriados)
  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  const handleSaveAll = useCallback(async () => {
    if (!config) return false
    setSaving(true)
    const ok = await updateRemuneracaoConfig(config.id, { feriados })
    setSaving(false)
    if (ok) {
      setSavedFeriados(feriados)
      await refetchRemuneracaoConfig()
      toast.success("Feriados atualizados com sucesso!")
    } else {
      toast.error("Erro ao salvar feriados.")
    }
    return ok
  }, [config, feriados])

  useEffect(() => {
    registerSave?.(handleSaveAll)
    return () => registerSave?.(null)
  }, [handleSaveAll, registerSave])

  const handleTipoChange = (tipo: "integral" | "parcial") => {
    setNovoTipo(tipo)
    if (tipo === "integral") {
      setNovoInicio(HORARIO_DIA_COMPLETO.inicio)
      setNovoFim(HORARIO_DIA_COMPLETO.fim)
    } else {
      setNovoInicio("")
      setNovoFim("")
    }
  }

  const handleAdd = () => {
    if (!novaData || !novoNome) return toast.error("Preencha a data e o nome.")
    if (novoTipo === "parcial" && (!novoInicio || !novoFim)) return toast.error("Selecione o horário de início e fim.")
    setFeriados(prev => ({
      ...prev,
      [novaData]: novoTipo === "integral"
        ? { nome: novoNome, tipo: novoTipo, horario_inicio: HORARIO_DIA_COMPLETO.inicio, horario_fim: HORARIO_DIA_COMPLETO.fim }
        // parcial_a_partir é redundante com horario_inicio, mas o banco exige essa
        // chave pra qualquer feriado "parcial" (CHECK remuneracao_config_feriados_check,
        // migration 20260706000006) — sem ela o salvamento é rejeitado.
        : { nome: novoNome, tipo: novoTipo, horario_inicio: novoInicio, horario_fim: novoFim, parcial_a_partir: novoInicio }
    }))
    setNovaData("")
    setNovoNome("")
    setNovoTipo("integral")
    setNovoInicio(HORARIO_DIA_COMPLETO.inicio)
    setNovoFim(HORARIO_DIA_COMPLETO.fim)
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
          <h3 className="font-bold text-lg text-foreground">Feriados Estaduais / Municipais</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            O sistema já desconta os feriados nacionais automaticamente. Adicione aqui apenas os feriados regionais que afetam a operação da clínica.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          {isDirty && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
              alterações não salvas
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: B.blue }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Feriados
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="col-span-12 md:col-span-3">
            <label htmlFor="feriado-data" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Data (YYYY-MM-DD)</label>
            <input id="feriado-data" type="date" value={novaData} onChange={e => setNovaData(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="col-span-12 md:col-span-5">
            <label htmlFor="feriado-nome" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Nome do Feriado</label>
            <input id="feriado-nome" type="text" placeholder="Digite" value={novoNome} onChange={e => setNovoNome(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <label htmlFor="feriado-tipo" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Tipo</label>
            <select id="feriado-tipo" value={novoTipo} onChange={e => handleTipoChange(e.target.value as "integral" | "parcial")} className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="integral" className="text-foreground bg-white dark:bg-slate-900">Dia completo</option>
              <option value="parcial" className="text-foreground bg-white dark:bg-slate-900">Parcial</option>
            </select>
          </div>

          {novoTipo === "integral" ? (
            <div className="col-span-12 md:col-span-6">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Horário</span>
              <div className="w-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg px-3 py-2 text-sm">
                {HORARIO_DIA_COMPLETO.inicio} - {HORARIO_DIA_COMPLETO.fim}
              </div>
            </div>
          ) : (
            <>
              <div className="col-span-6 md:col-span-3">
                <label htmlFor="feriado-inicio" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Horário início</label>
                <input id="feriado-inicio" type="time" value={novoInicio} onChange={e => setNovoInicio(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="col-span-6 md:col-span-3">
                <label htmlFor="feriado-fim" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Horário fim</label>
                <input id="feriado-fim" type="time" value={novoFim} onChange={e => setNovoFim(e.target.value)} className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </>
          )}

          <div className="col-span-12 md:col-span-2 flex items-end">
            <button onClick={handleAdd} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold px-4 py-2 rounded-lg">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {sortedDates.length === 0 ? (
          <div className="py-8 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            <p>Nenhum feriado local configurado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDates.map(date => {
              const f = feriados[date]
              const horario = horarioLabel(f)
              return (
                <div key={date} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {f.nome}
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${f.tipo === 'integral' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'}`}>
                        {TIPO_LABEL[f.tipo]}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {date}{horario ? ` · ${horario}` : ""}
                    </div>
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
