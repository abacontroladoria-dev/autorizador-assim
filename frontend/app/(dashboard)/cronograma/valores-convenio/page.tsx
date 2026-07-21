"use client"

import { useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { useConvenioValores } from "@/hooks/useConvenioValores"
import { excluirConvenioValor, excluirConvenioValorPaciente } from "@/services/convenioValores.service"
import { ConvenioValorEditModal } from "@/components/cronograma/valores/ConvenioValorEditModal"
import { ConvenioValorPacienteEditModal } from "@/components/cronograma/valores/ConvenioValorPacienteEditModal"
import type { ConvenioValor, ConvenioValorPaciente } from "@/lib/cronograma/convenioValoresTypes"

function fmtValor(v: number | null): string {
  return v === null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`
}

export default function ValoresConvenioPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Valores de Convênio", "Cadastro de valores negociados por convênio, terapia e paciente")
    return () => setHeader("", "")
  }, [setHeader])

  const { regrasGerais, excecoesPaciente, conveniosAgenda, terapiasAgenda, pacientesAgenda, loading, error, recarregar } = useConvenioValores()
  const [editandoRegra, setEditandoRegra] = useState<ConvenioValor | null | "novo">(null)
  const [editandoExcecao, setEditandoExcecao] = useState<ConvenioValorPaciente | null | "novo">(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  const regrasGeraisDoConvenio = regrasGerais.filter(r => !r.terapia_nome)
  const regrasPorTerapia = regrasGerais.filter(r => r.terapia_nome)

  async function excluirRegra(id: string) {
    setExcluindo(id)
    try {
      await excluirConvenioValor(id)
      recarregar()
    } finally {
      setExcluindo(null)
    }
  }

  async function excluirExcecao(id: string) {
    setExcluindo(id)
    try {
      await excluirConvenioValorPaciente(id)
      recarregar()
    } finally {
      setExcluindo(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard tone="slate" icon={<Wallet size={15} />} label="Regras gerais por convênio">
          <div className="text-2xl font-black text-foreground">{regrasGeraisDoConvenio.length}</div>
        </StatCard>
        <StatCard tone="blue" icon={<Wallet size={15} />} label="Regras por terapia">
          <div className="text-2xl font-black text-foreground">{regrasPorTerapia.length}</div>
        </StatCard>
        <StatCard tone="purple" icon={<Wallet size={15} />} label="Exceções por paciente">
          <div className="text-2xl font-black text-foreground">{excecoesPaciente.length}</div>
        </StatCard>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando valores cadastrados...
        </div>
      )}
      {error && <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {!loading && !error && (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Regras por convênio / terapia</h2>
                <p className="text-xs text-muted-foreground">Regra geral (Terapia em branco) ou específica por terapia dentro do convênio.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditandoRegra("novo")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                <Plus size={14} /> Nova regra
              </button>
            </div>
            {regrasGerais.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma regra cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase text-muted-foreground">
                      <th className="py-1.5 pr-3">Convênio</th>
                      <th className="py-1.5 pr-3">Terapia</th>
                      <th className="py-1.5 pr-3">Valor Hora</th>
                      <th className="py-1.5 pr-3">Valor Sessão</th>
                      <th className="py-1.5 pr-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regrasGerais.map(r => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-semibold text-foreground">{r.convenio_nome}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {r.terapia_nome
                            ? <>{r.terapia_nome} <span className="text-[11px]">(ID {r.terapia_id ?? "—"})</span></>
                            : <span className="italic">Regra geral</span>}
                        </td>
                        <td className="py-1.5 pr-3">{fmtValor(r.valor_hora)}</td>
                        <td className="py-1.5 pr-3">{fmtValor(r.valor_sessao)}</td>
                        <td className="py-1.5 pr-3 text-right">
                          <button type="button" onClick={() => setEditandoRegra(r)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirRegra(r.id)}
                            disabled={excluindo === r.id}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            {excluindo === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Exceções por paciente</h2>
                <p className="text-xs text-muted-foreground">Sobrescreve a regra do convênio só pra este paciente específico.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditandoExcecao("novo")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                <Plus size={14} /> Nova exceção
              </button>
            </div>
            {excecoesPaciente.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma exceção cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase text-muted-foreground">
                      <th className="py-1.5 pr-3">Convênio</th>
                      <th className="py-1.5 pr-3">Paciente</th>
                      <th className="py-1.5 pr-3">Valor Hora</th>
                      <th className="py-1.5 pr-3">Valor Sessão</th>
                      <th className="py-1.5 pr-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excecoesPaciente.map(r => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-semibold text-foreground">{r.convenio_nome}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{r.paciente_nome} <span className="text-[11px]">(ID {r.paciente_id ?? "—"})</span></td>
                        <td className="py-1.5 pr-3">{fmtValor(r.valor_hora)}</td>
                        <td className="py-1.5 pr-3">{fmtValor(r.valor_sessao)}</td>
                        <td className="py-1.5 pr-3 text-right">
                          <button type="button" onClick={() => setEditandoExcecao(r)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirExcecao(r.id)}
                            disabled={excluindo === r.id}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            {excluindo === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {editandoRegra && (
        <ConvenioValorEditModal
          regra={editandoRegra === "novo" ? null : editandoRegra}
          conveniosAgenda={conveniosAgenda}
          terapiasAgenda={terapiasAgenda}
          onClose={() => setEditandoRegra(null)}
          onSaved={recarregar}
        />
      )}
      {editandoExcecao && (
        <ConvenioValorPacienteEditModal
          regra={editandoExcecao === "novo" ? null : editandoExcecao}
          conveniosAgenda={conveniosAgenda}
          pacientesAgenda={pacientesAgenda}
          onClose={() => setEditandoExcecao(null)}
          onSaved={recarregar}
        />
      )}
    </div>
  )
}
