"use client"

import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, Save, AlertCircle } from "lucide-react"
import { B, TERAPIA_CORES } from "@/lib/cronograma/constants"
import { useParametrosGerais, refetchParametrosGerais } from "@/hooks/useParametrosGerais"
import { useTaxasEspecialidade, refetchTaxasEspecialidade } from "@/hooks/useTaxasEspecialidade"
import { updateParametrosGerais } from "@/services/parametrosGerais.service"
import { upsertTaxaEspecialidade } from "@/services/taxasEspecialidade.service"
import { useUnsavedChangesGuard } from "@/contexts/UnsavedChangesContext"

function InfoTooltip({ text }: { text: string }) {
  return (
    <div tabIndex={0} aria-label={text}
         className="group relative inline-flex items-center justify-center cursor-help ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-full">
      <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
        ?
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 z-50">
        <div className="rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white shadow-xl text-center">
          {text}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
      </div>
    </div>
  )
}

function especialidadeCor(esp: string): string {
  const hex = TERAPIA_CORES[esp]
  if (!hex || hex.toLowerCase() === "#ffffff" || hex.toLowerCase() === "#f0f0f0") return B.gray
  return hex
}

type Valor = {
  presenca: number
  ccPA: number
  ccPE: number
  ccLim: number
  etaBonus: number
  taxas: Record<string, number>
  diarias: Record<string, number>
}

export function TaxasEParametrosCadastro() {
  const { parametros, loading: loadingParametros, error: errorParametros } = useParametrosGerais()
  const { taxas_pa, diarias: diariasEspecialidade, loading: loadingTaxas } = useTaxasEspecialidade()
  const loading = loadingParametros || loadingTaxas
  const error = errorParametros

  const buildValor = useCallback((): Valor => ({
    presenca: parametros?.presenca_padrao ?? 80,
    ccPA: parametros?.cc_pa_default ?? 0,
    ccPE: parametros?.cc_pe_default ?? 0,
    ccLim: parametros?.cc_lim_default ?? 18,
    etaBonus: parametros?.eta_bonus_default ?? 0,
    taxas: taxas_pa,
    diarias: diariasEspecialidade,
  }), [parametros, taxas_pa, diariasEspecialidade])

  const [valor, setValor] = useState<Valor>(buildValor)
  const [savedValor, setSavedValor] = useState<Valor>(buildValor)
  const [saving, setSaving] = useState(false)

  // Ressincroniza com os dados assíncronos quando chegam/mudam depois do
  // mount — padrão recomendado do React para ajustar estado a partir de
  // props sem efeito (evita cascading-render dentro de useEffect).
  const [prevParametros, setPrevParametros] = useState(parametros)
  const [prevTaxas, setPrevTaxas] = useState(taxas_pa)
  if ((parametros && parametros !== prevParametros) || taxas_pa !== prevTaxas) {
    setPrevParametros(parametros)
    setPrevTaxas(taxas_pa)
    const fresh = buildValor()
    setValor(fresh)
    setSavedValor(fresh)
  }

  const update = useCallback((patch: Partial<Valor>) => {
    setValor(prev => ({ ...prev, ...patch }))
  }, [])

  const isDirty = JSON.stringify(valor) !== JSON.stringify(savedValor)

  const handleSalvarTudo = useCallback(async () => {
    if (!parametros) return false
    setSaving(true)

    const ops: Promise<boolean>[] = []

    const parametrosMudaram = valor.presenca !== savedValor.presenca || valor.ccPA !== savedValor.ccPA
      || valor.ccPE !== savedValor.ccPE || valor.ccLim !== savedValor.ccLim || valor.etaBonus !== savedValor.etaBonus
    if (parametrosMudaram) {
      ops.push(updateParametrosGerais(parametros.id, {
        presenca_padrao: valor.presenca,
        cc_pa_default: valor.ccPA,
        cc_pe_default: valor.ccPE,
        cc_lim_default: valor.ccLim,
        eta_bonus_default: valor.etaBonus,
      }))
    }

    const especialidades = new Set([...Object.keys(valor.taxas), ...Object.keys(valor.diarias)])
    for (const esp of especialidades) {
      const taxaPA = valor.taxas[esp] ?? 0
      const diaria = valor.diarias[esp] ?? 0
      if (taxaPA !== (savedValor.taxas[esp] ?? 0) || diaria !== (savedValor.diarias[esp] ?? 0)) {
        ops.push(upsertTaxaEspecialidade({ especialidade: esp, taxa_pa: taxaPA, diaria }))
      }
    }

    const resultados = await Promise.all(ops)
    const ok = resultados.every(Boolean)
    setSaving(false)
    if (ok) {
      setSavedValor(valor)
      await Promise.all([refetchParametrosGerais(), refetchTaxasEspecialidade()])
      toast.success("Configurações salvas.")
    } else {
      toast.error("Erro ao salvar configurações.")
    }
    return ok
  }, [parametros, valor, savedValor])

  const { registerGuard } = useUnsavedChangesGuard()
  useEffect(() => {
    registerGuard({ isDirty, save: handleSalvarTudo })
    return () => registerGuard(null)
  })

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !parametros) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-red-800 dark:text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Erro ao carregar configurações</div>
            <div className="text-sm mt-1">{error || "Configuração não encontrada"}</div>
          </div>
        </div>
      </div>
    )
  }

  const { presenca, ccPA, ccPE, ccLim, etaBonus, taxas, diarias } = valor
  const allEspecialidades = Array.from(new Set([...Object.keys(taxas), ...Object.keys(diarias)])).sort()

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Variáveis & Taxas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            As alterações aqui refletem imediatamente em todas as novas análises da calculadora de remuneração.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isDirty && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
              alterações não salvas
            </span>
          )}
          <button
            type="button"
            onClick={handleSalvarTudo}
            disabled={saving || !isDirty}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: B.blue }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bloco 1: Globais */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-foreground">Valores Padrão</h3>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-sm">

            <div>
              <label htmlFor="config-presenca" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.navy }}>
                Taxa de Presença Projetada (%)
                <InfoTooltip text="Usado na Análise Futura para estimar o ganho real descontando faltas. Padrão 80%." />
              </label>
              <input
                id="config-presenca"
                type="number" min="0" max="100"
                value={presenca}
                onChange={e => update({ presenca: Number(e.target.value) })}
                className="w-full sm:w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              />
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div>
              <label htmlFor="config-cc-pe" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.purple }}>
                Coordenador de Caso — PE base
                <InfoTooltip text="Valor por Paciente Único no mês, para a função de Coordenador." />
              </label>
              <div className="relative w-full sm:w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input
                  id="config-cc-pe"
                  type="number" min="0" step="0.01"
                  value={ccPE}
                  onChange={e => update({ ccPE: Number(e.target.value) })}
                  className="w-full rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-shadow"
                />
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div>
              <label htmlFor="config-cc-lim" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.purple }}>
                Coordenador de Caso — Limite padrão de pacientes
                <InfoTooltip text="Limite geral de pacientes por Coordenador de Caso/Analista do Comportamento, usado no alerta de excesso em Rem. Mês - Previsão." />
              </label>
              <input
                id="config-cc-lim"
                type="number" min="0"
                value={ccLim}
                onChange={e => update({ ccLim: Number(e.target.value) })}
                className="w-full sm:w-32 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-shadow"
              />
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div>
              <label htmlFor="config-eta-bonus" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.orange }}>
                Especialista Técnico de Área — Bônus
                <InfoTooltip text="Valor fixo por semana trabalhada." />
              </label>
              <div className="relative w-full sm:w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input
                  id="config-eta-bonus"
                  type="number" min="0" step="0.01"
                  value={etaBonus}
                  onChange={e => update({ etaBonus: Number(e.target.value) })}
                  className="w-full rounded-lg border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-shadow"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Bloco 2: Especialidades */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-foreground">Taxas por Especialidade</h3>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[600px]">

            <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <div className="col-span-6">Especialidade</div>
              <div className="col-span-3 text-right">PA (R$)</div>
              <div className="col-span-3 text-right">Diária (R$)</div>
            </div>

            <div className="overflow-y-auto p-2 space-y-1">
              {(() => {
                const ccHex = especialidadeCor("Coordenador de Caso")
                return (
                  <div
                    className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border"
                    style={{ background: ccHex + "14", borderColor: ccHex + "55" }}
                  >
                    <div className="col-span-6 flex items-center text-sm font-bold truncate pr-2" style={{ color: ccHex }} title="Coordenador de Caso">
                      Coordenador de Caso
                    </div>
                    <div className="col-span-3">
                      <input
                        id="config-cc-pa"
                        type="number" min="0" step="0.01"
                        value={ccPA}
                        onChange={e => update({ ccPA: Number(e.target.value) })}
                        className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        style={{ borderColor: ccHex + "55" }}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        id="config-cc-diaria"
                        type="number" min="0" step="0.01"
                        value={diarias["Coordenador de Caso"] || 0}
                        onChange={e => update({ diarias: { ...diarias, "Coordenador de Caso": Number(e.target.value) } })}
                        className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        style={{ borderColor: ccHex + "55" }}
                      />
                    </div>
                  </div>
                )
              })()}
              {allEspecialidades.map(esp => {
                if (esp === "Coordenador de Caso") return null // Tem bloco próprio
                const hex = especialidadeCor(esp)
                return (
                  <div
                    key={esp}
                    className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-transparent transition-colors"
                    style={{ background: hex + "0d" }}
                  >
                    <div className="col-span-6 text-sm font-bold truncate pr-2" style={{ color: hex }} title={esp}>
                      {esp}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number" min="0" step="0.01"
                        value={taxas[esp] || 0}
                        onChange={e => update({ taxas: { ...taxas, [esp]: Number(e.target.value) } })}
                        className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        style={{ borderColor: hex + "55" }}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number" min="0" step="0.01"
                        value={diarias[esp] || 0}
                        onChange={e => update({ diarias: { ...diarias, [esp]: Number(e.target.value) } })}
                        className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        style={{ borderColor: hex + "55" }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
