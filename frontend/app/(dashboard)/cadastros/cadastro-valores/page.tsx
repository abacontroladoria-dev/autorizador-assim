"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Pencil, Plus, Trash2, Tag, HelpCircle, ArrowRight, Search, ChevronDown, ChevronRight } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { useConvenioValores } from "@/hooks/useConvenioValores"
import { excluirConvenioValor, excluirConvenioValorPaciente, excluirConvenioPacoteAvaliacao } from "@/services/convenioValores.service"
import { ConvenioValorEditModal } from "@/components/cronograma/valores/ConvenioValorEditModal"
import { ConvenioValorPacienteEditModal } from "@/components/cronograma/valores/ConvenioValorPacienteEditModal"
import { ConvenioPacoteAvaliacaoEditModal } from "@/components/cronograma/valores/ConvenioPacoteAvaliacaoEditModal"
import { normTxt } from "@/lib/cronograma/constants"
import type { ConvenioValor, ConvenioValorPaciente, ConvenioPacoteAvaliacao } from "@/lib/cronograma/convenioValoresTypes"

function fmtValor(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`
}

/** Agrupa linhas por convenio_nome (ordem: mais linhas primeiro, depois alfabética) — base de cada seção virar um acordeão por convênio em vez de uma lista única gigante. */
function agruparPorConvenio<T extends { convenio_nome: string }>(rows: T[]): { convenio: string; itens: T[] }[] {
  const mapa = new Map<string, T[]>()
  rows.forEach(r => {
    if (!mapa.has(r.convenio_nome)) mapa.set(r.convenio_nome, [])
    mapa.get(r.convenio_nome)!.push(r)
  })
  return [...mapa.entries()]
    .map(([convenio, itens]) => ({ convenio, itens }))
    .sort((a, b) => b.itens.length - a.itens.length || a.convenio.localeCompare(b.convenio))
}

function BuscaSecao({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}

interface GrupoConvenioProps {
  convenio: string
  count: number
  aberto: boolean
  onToggle: () => void
  children: React.ReactNode
}

function GrupoConvenio({ convenio, count, aberto, onToggle, children }: GrupoConvenioProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {aberto ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
          {convenio}
        </span>
        <span className="text-xs text-muted-foreground">{count} {count !== 1 ? "itens" : "item"}</span>
      </button>
      {aberto && <div className="border-t border-border px-3 py-2 overflow-x-auto">{children}</div>}
    </div>
  )
}

export default function CadastroValoresPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Cadastro de Valores", "Cadastro de valores negociados por convênio, terapia e paciente")
    return () => setHeader("", "")
  }, [setHeader])

  const { regrasGerais, excecoesPaciente, pacotesAvaliacao, conveniosAgenda, terapiasAgenda, pacientesAgenda, loading, error, recarregar } = useConvenioValores()
  const [editandoRegra, setEditandoRegra] = useState<ConvenioValor | null | "novo">(null)
  const [editandoExcecao, setEditandoExcecao] = useState<ConvenioValorPaciente | null | "novo">(null)
  const [editandoPacote, setEditandoPacote] = useState<ConvenioPacoteAvaliacao | null | "novo">(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [mostrarAjuda, setMostrarAjuda] = useState(false)

  const [buscaRegras, setBuscaRegras] = useState("")
  const [buscaExcecoes, setBuscaExcecoes] = useState("")
  const [buscaPacotes, setBuscaPacotes] = useState("")
  const [gruposRegrasAbertos, setGruposRegrasAbertos] = useState<Set<string>>(new Set())
  const [gruposExcecoesAbertos, setGruposExcecoesAbertos] = useState<Set<string>>(new Set())
  const [gruposPacotesAbertos, setGruposPacotesAbertos] = useState<Set<string>>(new Set())

  function toggleGrupo(set: Set<string>, setter: (v: Set<string>) => void, chave: string) {
    const proximo = new Set(set)
    if (proximo.has(chave)) proximo.delete(chave)
    else proximo.add(chave)
    setter(proximo)
  }

  const regrasGeraisDoConvenio = regrasGerais.filter(r => !r.terapia_nome)
  const regrasPorTerapia = regrasGerais.filter(r => r.terapia_nome)

  const regrasFiltradas = useMemo(() => {
    const q = normTxt(buscaRegras.trim())
    if (!q) return regrasGerais
    return regrasGerais.filter(r =>
      normTxt(r.convenio_nome).includes(q) || normTxt(r.terapia_nome ?? "").includes(q)
    )
  }, [regrasGerais, buscaRegras])

  const excecoesFiltradas = useMemo(() => {
    const q = normTxt(buscaExcecoes.trim())
    if (!q) return excecoesPaciente
    return excecoesPaciente.filter(r =>
      normTxt(r.convenio_nome).includes(q) || normTxt(r.paciente_nome).includes(q)
    )
  }, [excecoesPaciente, buscaExcecoes])

  const pacotesFiltrados = useMemo(() => {
    const q = normTxt(buscaPacotes.trim())
    if (!q) return pacotesAvaliacao
    return pacotesAvaliacao.filter(p =>
      normTxt(p.convenio_nome).includes(q) || normTxt(p.terapia_nome).includes(q)
    )
  }, [pacotesAvaliacao, buscaPacotes])

  const gruposRegras = useMemo(() => agruparPorConvenio(regrasFiltradas), [regrasFiltradas])
  const gruposExcecoes = useMemo(() => agruparPorConvenio(excecoesFiltradas), [excecoesFiltradas])
  const gruposPacotes = useMemo(() => agruparPorConvenio(pacotesFiltrados), [pacotesFiltrados])

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

  async function excluirPacote(id: string) {
    setExcluindo(id)
    try {
      await excluirConvenioPacoteAvaliacao(id)
      recarregar()
    } finally {
      setExcluindo(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<Tag size={15} />} label="Regras gerais por convênio">
          <div className="text-2xl font-black text-foreground">{regrasGeraisDoConvenio.length}</div>
        </StatCard>
        <StatCard tone="blue" icon={<Tag size={15} />} label="Regras por terapia">
          <div className="text-2xl font-black text-foreground">{regrasPorTerapia.length}</div>
        </StatCard>
        <StatCard tone="purple" icon={<Tag size={15} />} label="Exceções por paciente">
          <div className="text-2xl font-black text-foreground">{excecoesPaciente.length}</div>
        </StatCard>
        <StatCard tone="amber" icon={<HelpCircle size={15} />} label="Como funcionam as regras de sobreposição?">
          <button
            type="button"
            onClick={() => setMostrarAjuda(true)}
            className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
          >
            Saiba mais
            <ArrowRight size={13} />
          </button>
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex flex-col gap-2">
                <BuscaSecao valor={buscaRegras} onChange={setBuscaRegras} placeholder="Buscar convênio ou terapia..." />
                {gruposRegras.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado pra essa busca.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {gruposRegras.map(g => (
                      <GrupoConvenio
                        key={g.convenio}
                        convenio={g.convenio}
                        count={g.itens.length}
                        aberto={!!buscaRegras.trim() || gruposRegrasAbertos.has(g.convenio)}
                        onToggle={() => toggleGrupo(gruposRegrasAbertos, setGruposRegrasAbertos, g.convenio)}
                      >
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-bold uppercase text-muted-foreground">
                              <th className="py-1 pr-3">Terapia</th>
                              <th className="py-1 pr-3">Valor Sessão</th>
                              <th className="py-1 pr-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map(r => (
                              <tr key={r.id} className="border-t border-border/60">
                                <td className="py-1 pr-3 text-muted-foreground">
                                  {r.criterio_aba
                                    ? <span className="font-medium text-foreground">{r.criterio_aba === "com_aba" ? "Com Psicologia ABA" : "Sem Psicologia ABA"}</span>
                                    : r.terapia_nome
                                      ? <>{r.terapia_nome} <span className="text-[11px]">(ID {r.terapia_id ?? "—"})</span></>
                                      : <span className="italic">Regra geral</span>}
                                </td>
                                <td className="py-1 pr-3">{fmtValor(r.valor_sessao)}</td>
                                <td className="py-1 pr-3 text-right">
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
                      </GrupoConvenio>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex flex-col gap-2">
                <BuscaSecao valor={buscaExcecoes} onChange={setBuscaExcecoes} placeholder="Buscar convênio ou paciente..." />
                {gruposExcecoes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado pra essa busca.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {gruposExcecoes.map(g => (
                      <GrupoConvenio
                        key={g.convenio}
                        convenio={g.convenio}
                        count={g.itens.length}
                        aberto={!!buscaExcecoes.trim() || gruposExcecoesAbertos.has(g.convenio)}
                        onToggle={() => toggleGrupo(gruposExcecoesAbertos, setGruposExcecoesAbertos, g.convenio)}
                      >
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-bold uppercase text-muted-foreground">
                              <th className="py-1 pr-3">Paciente</th>
                              <th className="py-1 pr-3">Valor Sessão</th>
                              <th className="py-1 pr-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map(r => (
                              <tr key={r.id} className="border-t border-border/60">
                                <td className="py-1 pr-3 text-muted-foreground">{r.paciente_nome} <span className="text-[11px]">(ID {r.paciente_id ?? "—"})</span></td>
                                <td className="py-1 pr-3">{fmtValor(r.valor_sessao)}</td>
                                <td className="py-1 pr-3 text-right">
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
                      </GrupoConvenio>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">Valores por Terapia (Avaliação Neuropsicológica / Psiquiatra-Neurologista)</h2>
                <p className="text-xs text-muted-foreground">Valor por convênio + terapia, cobrado uma vez por paciente com aquela terapia — não é por sessão. O valor à vista entra na Previsão de Receitas; o parcelado é só referência.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditandoPacote("novo")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                <Plus size={14} /> Novo valor
              </button>
            </div>
            {pacotesAvaliacao.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhum valor cadastrado ainda.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <BuscaSecao valor={buscaPacotes} onChange={setBuscaPacotes} placeholder="Buscar convênio ou terapia..." />
                {gruposPacotes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado pra essa busca.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {gruposPacotes.map(g => (
                      <GrupoConvenio
                        key={g.convenio}
                        convenio={g.convenio}
                        count={g.itens.length}
                        aberto={!!buscaPacotes.trim() || gruposPacotesAbertos.has(g.convenio)}
                        onToggle={() => toggleGrupo(gruposPacotesAbertos, setGruposPacotesAbertos, g.convenio)}
                      >
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-bold uppercase text-muted-foreground">
                              <th className="py-1 pr-3">Terapia</th>
                              <th className="py-1 pr-3">Valor à Vista</th>
                              <th className="py-1 pr-3">Valor Parcelado</th>
                              <th className="py-1 pr-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map(p => (
                              <tr key={p.id} className="border-t border-border/60">
                                <td className="py-1 pr-3 text-muted-foreground">{p.terapia_nome} <span className="text-[11px]">(ID {p.terapia_id})</span></td>
                                <td className="py-1 pr-3">{fmtValor(p.valor_a_vista)}</td>
                                <td className="py-1 pr-3 text-muted-foreground">{fmtValor(p.valor_parcelado)}</td>
                                <td className="py-1 pr-3 text-right">
                                  <button type="button" onClick={() => setEditandoPacote(p)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => excluirPacote(p.id)}
                                    disabled={excluindo === p.id}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                  >
                                    {excluindo === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </GrupoConvenio>
                    ))}
                  </div>
                )}
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
      {editandoPacote && (
        <ConvenioPacoteAvaliacaoEditModal
          regra={editandoPacote === "novo" ? null : editandoPacote}
          conveniosAgenda={conveniosAgenda}
          onClose={() => setEditandoPacote(null)}
          onSaved={recarregar}
        />
      )}

      {mostrarAjuda && (
        <ScheduleModal
          title="Como funcionam as regras de sobreposição?"
          subtitle="Quando mais de uma regra poderia se aplicar à mesma sessão, o sistema escolhe nesta ordem — a primeira que tiver um valor cadastrado já resolve, sem olhar as próximas."
          maxWidth={620}
          onClose={() => setMostrarAjuda(false)}
        >
          <div className="flex flex-col gap-4 text-sm text-foreground">
            <ol className="flex flex-col gap-3">
              <li className="rounded-lg border border-border bg-card p-3">
                <div className="font-bold">1º — Exceção por paciente</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  A mais específica, sempre vence. Uma regra cadastrada pra um paciente específico dentro de um convênio sobrepõe qualquer regra geral ou por terapia daquele convênio, não importa a terapia da sessão.
                </p>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <div className="font-bold">2º — Critério ABA</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vale pra <strong>todas</strong> as sessões do paciente naquele convênio, dependendo só de o cronograma dele conter Psicologia ABA ou não (ex.: SEGUROS UNIMED: com ABA → R$170, sem ABA → R$135). Não olha qual é a terapia específica da sessão.
                </p>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <div className="font-bold">3º — Regra por terapia</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor específico pra uma terapia dentro do convênio (ex.: ASSIM Saúde → Fonoaudiologia = R$120, Terapia Ocupacional = R$120).
                </p>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <div className="font-bold">4º — Regra geral do convênio</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor padrão aplicado quando nenhuma das anteriores foi definida (ex.: ASSIM Saúde → R$100 pra qualquer terapia sem regra específica).
                </p>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Se nenhuma das 4 camadas tiver valor cadastrado pra uma sessão, ela aparece como <strong>"sem valor"</strong> na Previsão de Receitas — não entra no total projetado.
            </p>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <strong>Processo Diagnóstico</strong> (Avaliação Neuropsicológica/Psiquiatra-Neurologista/Triagem) não usa nenhuma dessas 4 regras — elas foram desenhadas pra sessão fixa de 40min. As exceções são <strong>Avaliação Neuropsicológica</strong> e <strong>Psiquiatra/Neurologista</strong>, que têm cadastro próprio (seção "Valores por Terapia" abaixo): um valor por convênio + terapia, cobrado uma vez por paciente — não por sessão. Triagem continua "sem valor" até ganhar cadastro próprio também.
            </div>
            <p className="text-[11px] text-muted-foreground">
              O casamento é sempre por <strong>ID</strong> (paciente_id, terapia_id), não por nome — renomear um paciente/terapia no TITA não quebra a regra já cadastrada.
            </p>
          </div>
        </ScheduleModal>
      )}
    </div>
  )
}
