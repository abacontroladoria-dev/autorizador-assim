"use client"

import { useEffect, useState } from "react"
import { Save, AlertCircle, Loader2 } from "lucide-react"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { updateRemuneracaoConfig } from "@/services/remuneracao.service"
import { B } from "@/lib/cronograma/constants"
import { useHeader } from "@/contexts/HeaderContext"

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center justify-center cursor-help ml-1">
      <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
        ?
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 transition-opacity group-hover:opacity-100 z-50">
        <div className="rounded-lg bg-slate-800 dark:bg-slate-200 p-2 text-xs text-white dark:text-slate-900 shadow-xl text-center">
          {text}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800 dark:border-t-slate-200" />
      </div>
    </div>
  )
}

import { CapacidadeConfig } from "./config/CapacidadeConfig"
import { ContratosAntigosConfig } from "./config/ContratosAntigosConfig"
import { ContratosAtuaisConfig } from "./config/ContratosAtuaisConfig"
import { FeriadosConfig } from "./config/FeriadosConfig"

export function ConfigTab() {
  const { config, loading: configLoading, error: configError } = useRemuneracaoConfig()
  const { setHeader } = useHeader()

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState("geral")

  // Estado local para edição
  const [presenca, setPresenca] = useState(80)
  const [ccPA, setCcPA] = useState(0)
  const [ccPE, setCcPE] = useState(0)
  const [etaBonus, setEtaBonus] = useState(0)
  
  const [taxas, setTaxas] = useState<Record<string, number>>({})
  const [diarias, setDiarias] = useState<Record<string, number>>({})

  // Inicializa estado local quando config carrega
  useEffect(() => {
    if (config) {
      setPresenca(config.presenca_padrao)
      setCcPA(config.cc_pa_default)
      setCcPE(config.cc_pe_default)
      setEtaBonus(config.eta_bonus_default)
      setTaxas(config.taxas_pa || {})
      setDiarias(config.diarias || {})
    }
  }, [config])

  useEffect(() => {
    setHeader("Configurações Globais", "Relacionamento Prestador")
  }, [setHeader])

  if (configLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (configError || !config) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-bold">Erro ao carregar configurações</div>
            <div className="text-sm mt-1">{configError || "Configuração não encontrada"}</div>
          </div>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)
    const patch = {
      presenca_padrao: presenca,
      cc_pa_default: ccPA,
      cc_pe_default: ccPE,
      eta_bonus_default: etaBonus,
      taxas_pa: taxas,
      diarias: diarias,
    }
    
    const ok = await updateRemuneracaoConfig(config.id, patch)
    setSaving(false)
    if (ok) {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      alert("Erro ao salvar configurações no banco de dados.")
    }
  }

  const allEspecialidades = Array.from(new Set([
    ...Object.keys(taxas),
    ...Object.keys(diarias)
  ])).sort()

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      
      {/* Cabeçalho da página de config */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight" style={{ color: B.navy }}>
            Parâmetros de Cálculo
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            As alterações aqui refletem imediatamente em todas as novas análises da calculadora.
          </p>
        </div>
        
        {activeTab === "geral" && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all disabled:opacity-50"
            style={{ background: saveSuccess ? B.green : B.blue }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando..." : saveSuccess ? "Salvo com sucesso!" : "Salvar Globais"}
          </button>
        )}
      </div>

      {/* Navegação de Abas Internas */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: "geral", label: "Variáveis & Taxas" },
          { id: "cadastros", label: "Contratos Atuais" },
          { id: "antigos", label: "Contratos Antigos" },
          { id: "capacidade", label: "Capacidade" },
          { id: "feriados", label: "Feriados" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === t.id 
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo: Geral (Taxas e Valores) */}
      {activeTab === "geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
          
          {/* Bloco 1: Globais */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg" style={{ color: B.navy }}>Valores Padrão</h3>
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-sm">
              
              <div>
                <label className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.navy }}>
                  Taxa de Presença Projetada (%)
                  <InfoTooltip text="Usado na Análise Futura para estimar o ganho real descontando faltas. Padrão 80%." />
                </label>
                <input 
                  type="number" min="0" max="100" 
                  value={presenca} 
                  onChange={e => setPresenca(Number(e.target.value))}
                  className="w-full sm:w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
                />
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800" />

              <div>
                <label className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.purple }}>
                  Coordenador de Caso — PA base
                  <InfoTooltip text="Valor por sessão (40min) evoluída de AC." />
                </label>
                <div className="relative w-full sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input 
                    type="number" min="0" step="0.01" 
                    value={ccPA} 
                    onChange={e => setCcPA(Number(e.target.value))}
                    className="w-full rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-shadow"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.purple }}>
                  Coordenador de Caso — PE base
                  <InfoTooltip text="Valor por Paciente Único no mês, para a função de Coordenador." />
                </label>
                <div className="relative w-full sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input 
                    type="number" min="0" step="0.01" 
                    value={ccPE} 
                    onChange={e => setCcPE(Number(e.target.value))}
                    className="w-full rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-shadow"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800" />

              <div>
                <label className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.orange }}>
                  Especialista Técnico de Área — Bônus
                  <InfoTooltip text="Valor fixo por semana trabalhada." />
                </label>
                <div className="relative w-full sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input 
                    type="number" min="0" step="0.01" 
                    value={etaBonus} 
                    onChange={e => setEtaBonus(Number(e.target.value))}
                    className="w-full rounded-lg border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-shadow"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Bloco 2: Especialidades */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg" style={{ color: B.navy }}>Taxas por Especialidade</h3>
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[600px]">
              
              <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-6">Especialidade</div>
                <div className="col-span-3 text-right">PA (R$)</div>
                <div className="col-span-3 text-right">Diária (R$)</div>
              </div>

              <div className="overflow-y-auto p-2 space-y-1">
                {allEspecialidades.map(esp => {
                  if (esp === "Coordenador de Caso") return null // Tem bloco próprio
                  return (
                    <div key={esp} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="col-span-6 text-sm font-medium truncate pr-2" title={esp}>
                        {esp}
                      </div>
                      <div className="col-span-3">
                        <input 
                          type="number" min="0" step="0.01"
                          value={taxas[esp] || 0}
                          onChange={e => setTaxas(t => ({ ...t, [esp]: Number(e.target.value) }))}
                          className="w-full text-right rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          type="number" min="0" step="0.01"
                          value={diarias[esp] || 0}
                          onChange={e => setDiarias(d => ({ ...d, [esp]: Number(e.target.value) }))}
                          className="w-full text-right rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              
            </div>
          </div>

        </div>
      )}

      {/* Conteúdo: Cadastros Atuais */}
      {activeTab === "cadastros" && <ContratosAtuaisConfig />}

      {/* Conteúdo: Contratos Antigos */}
      {activeTab === "antigos" && <ContratosAntigosConfig />}

      {/* Conteúdo: Capacidade */}
      {activeTab === "capacidade" && <CapacidadeConfig />}

      {/* Conteúdo: Feriados */}
      {activeTab === "feriados" && <FeriadosConfig />}

    </div>
  )
}
