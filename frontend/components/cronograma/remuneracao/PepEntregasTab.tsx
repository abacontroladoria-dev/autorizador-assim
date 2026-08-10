"use client"

import { useEffect, useMemo, useState } from "react"
import { Paperclip, Check, AlertTriangle, CalendarPlus, X, Trash2 } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { useParametrosGerais } from "@/hooks/useParametrosGerais"
import { usePepEntregas } from "@/hooks/usePepEntregas"
import { usePepApuracao } from "@/hooks/usePepApuracao"
import { usePepCalendario } from "@/hooks/usePepCalendario"
import { RemuneracaoUploadBadges } from "./RemuneracaoUploadBadges"
import type { PepCatalogoItem, PepEvidencia, PepPlanejamentoSemestral, PepRegistroEntrega } from "@/types/pep"

const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

function competenciaAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function addMeses(competencia: string, meses: number): string {
  const [y, m] = competencia.split("-").map(Number)
  const d = new Date(y, m - 1 + meses, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Quantidade esperada no mês para um item recorrente. PRD Seção 9.11: só os
// itens SEMANAIS (Supervisão/Estudo) variam com o calendário parametrizado —
// mês de recesso espera 3 unidades em vez de 4. TAP/Parental usam sempre a
// referência fixa do catálogo, calendário nenhum os afeta (Seção 7.2).
function quantidadeEsperada(item: PepCatalogoItem, semanasCalendario: number): number {
  if (item.periodicidade === "semanal") return semanasCalendario
  return item.qtd_referencia_mes ?? 1
}

// Quantos meses se passaram entre a competência planejada e a atual —
// PRD Seção 10.1: dentro de 1 mês do vencimento ainda é "aceite postergado"
// normal; a partir de 2 meses é pendência reiterada (o sistema deve
// sinalizar — risco de inadimplemento de obrigação essencial).
function mesesEntre(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number)
  const [by, bm] = b.split("-").map(Number)
  return (by - ay) * 12 + (bm - am)
}

// Garante exatamente `n` posições de evidência, preservando o que já existia.
function normalizarEvidencias(evidencias: PepEvidencia[], n: number): PepEvidencia[] {
  const base = Array.from({ length: n }, (_, i) => evidencias[i] ?? { caminho: "", nome: null })
  return base
}

type CelulaAtiva = { pacienteNome: string | null; item: PepCatalogoItem } | null

export function PepEntregasTab() {
  const {
    resultado, evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName,
  } = useRemuneracaoRPContext()
  const { setHeader, setRightContent } = useHeader()

  const [prestador, setPrestador] = useState("")
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [celulaAtiva, setCelulaAtiva] = useState<CelulaAtiva>(null)
  const { semanas: semanasCalendario, salvar: salvarSemanasCalendario } = usePepCalendario(competencia)

  // A Grade carregada aqui alimenta o mesmo contexto compartilhado das abas
  // Rem. Mês - Total e Individual — não precisa reanexar ao trocar de aba.
  useEffect(() => {
    setHeader("Entregas PEP", "Relacionamento Prestador")
    setRightContent(
      <RemuneracaoUploadBadges
        evoRows={evoRows}
        peRows={peRows}
        carregarGrade={carregarGrade}
        carregarPE={carregarPE}
        limparGrade={limparGrade}
        limparPE={limparPE}
        setCsvName={setCsvName}
        hidePe
      />
    )
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName])

  const analistas = useMemo(
    () => Array.from(new Set(
      (resultado ?? [])
        .filter(p => p.sessoes.some(s => s.especialidade === "Coordenador de Caso"))
        .map(p => p.prof)
    )).sort((a, b) => a.localeCompare(b)),
    [resultado]
  )

  const pacientes = useMemo(() => {
    const p = (resultado ?? []).find(r => r.prof === prestador)
    if (!p) return []
    return Array.from(new Set(
      p.sessoes.filter(s => s.especialidade === "Coordenador de Caso" && s.paciente).map(s => s.paciente)
    )).sort((a, b) => a.localeCompare(b))
  }, [resultado, prestador])

  const {
    itensRecorrentes, itensSemestrais,
    loading, error, salvando,
    registroDe, planejamentoDe,
    marcarEntrega, marcarQuantidade, cadastrarPlanejamento,
    excluirRegistro, excluirPlanejamento,
  } = usePepEntregas(prestador, competencia)

  const { parametros } = useParametrosGerais()
  const valorMensalPorPaciente = parametros?.cc_pe_default ?? 0
  const pacientesApuracao = useMemo(() => pacientes.map(nome => ({ nome })), [pacientes])
  const { resultadoDe, totalPrestador, recalcular: recalcularApuracao, liberado, liberar, reabrir } = usePepApuracao(
    prestador, competencia, pacientesApuracao, valorMensalPorPaciente
  )
  const [confirmandoLiberar, setConfirmandoLiberar] = useState(false)
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false)
  const [motivoReabrir, setMotivoReabrir] = useState("")

  const itensGerais = itensRecorrentes.filter(i => i.tipo_registro === "GERAL")
  const itensPorPaciente = itensRecorrentes.filter(i => i.tipo_registro === "POR_PACIENTE")

  if (!prestador) {
    return (
      <div className="space-y-5">
        <SeletorPrestador analistas={analistas} prestador={prestador} onChange={setPrestador} />
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {analistas.length === 0
            ? "Nenhum Analista do Comportamento encontrado. Faça o upload da Grade no botão acima para carregar a lista de prestadores e pacientes."
            : "Selecione um Analista do Comportamento acima para registrar as entregas da PEP."}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SeletorPrestador analistas={analistas} prestador={prestador} onChange={setPrestador} />

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="pep-competencia" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Competência
          </label>
          <input
            id="pep-competencia"
            type="month"
            value={competencia}
            onChange={e => setCompetencia(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <label htmlFor="pep-semanas" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="PRD Seção 9.11 — calendário parametrizado. Só afeta Supervisão/Estudo.">
              Semanas no mês (Sup./Estudo)
            </label>
            <select
              id="pep-semanas"
              value={semanasCalendario}
              onChange={e => salvarSemanasCalendario(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value={3}>3 (recesso)</option>
              <option value={4}>4 (padrão)</option>
              <option value={5}>5</option>
            </select>
          </div>
          {salvando && <span className="text-xs text-muted-foreground">Salvando…</span>}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {valorMensalPorPaciente > 0 && pacientes.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Potencial do mês</p>
            <p className="text-lg font-bold text-foreground">{money(pacientes.length * valorMensalPorPaciente)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alcançado (apurado)</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{money(totalPrestador)}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {liberado ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <Check size={13} /> Faturamento liberado
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmandoReabrir(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground bg-background hover:bg-muted/50"
                >
                  Reabrir
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoLiberar(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:opacity-90"
              >
                Liberar Faturamento
              </button>
            )}
          </div>
        </div>
      )}

      {confirmandoLiberar && (
        <ConfirmModal
          titulo="Liberar Faturamento"
          mensagem={`Confirma a liberação do faturamento de ${prestador} para ${competencia}? Depois de liberado, os lançamentos desta competência ficam bloqueados para edição até uma reabertura.`}
          pedirMotivo={false}
          motivo=""
          onMotivoChange={() => {}}
          confirmLabel="Liberar"
          onConfirmar={async () => {
            await liberar()
            setConfirmandoLiberar(false)
          }}
          onCancelar={() => setConfirmandoLiberar(false)}
        />
      )}

      {confirmandoReabrir && (
        <ConfirmModal
          titulo="Reabrir Faturamento"
          mensagem={`Reabrir permite editar novamente os lançamentos de ${prestador} em ${competencia}. Essa ação fica registrada na trilha de auditoria.`}
          pedirMotivo
          motivo={motivoReabrir}
          onMotivoChange={setMotivoReabrir}
          confirmLabel="Reabrir"
          perigo
          onConfirmar={async () => {
            const ok = await reabrir(motivoReabrir)
            if (ok) {
              setConfirmandoReabrir(false)
              setMotivoReabrir("")
            }
          }}
          onCancelar={() => { setConfirmandoReabrir(false); setMotivoReabrir("") }}
        />
      )}

      {itensGerais.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Geral (sem paciente)
          </p>
          <div className="flex flex-wrap gap-3">
            {itensGerais.map(item => (
              <CelulaRecorrente
                key={item.id}
                item={item}
                semanasCalendario={semanasCalendario}
                registro={registroDe(null, item.id)}
                onClick={() => setCelulaAtiva({ pacienteNome: null, item })}
                disabled={liberado}
              />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : pacientes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum paciente encontrado para este Analista na Grade carregada.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Paciente</th>
                {itensPorPaciente.map(item => (
                  <th key={item.id} className="px-3 py-3 font-semibold text-muted-foreground text-center" title={item.nome}>
                    {item.sigla}
                  </th>
                ))}
                {itensSemestrais.map(item => (
                  <th key={item.id} className="px-3 py-3 font-semibold text-muted-foreground text-center" title={item.nome}>
                    {item.sigla}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold text-muted-foreground text-right">PEP apurada</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map(paciente => (
                <tr key={paciente} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{paciente}</td>
                  {itensPorPaciente.map(item => (
                    <td key={item.id} className="px-3 py-3 text-center">
                      <CelulaRecorrente
                        item={item}
                        semanasCalendario={semanasCalendario}
                        registro={registroDe(paciente, item.id)}
                        onClick={() => setCelulaAtiva({ pacienteNome: paciente, item })}
                        disabled={liberado}
                      />
                    </td>
                  ))}
                  {itensSemestrais.map(item => (
                    <td key={item.id} className="px-3 py-3 text-center">
                      <CelulaSemestral
                        item={item}
                        competencia={competencia}
                        registro={registroDe(paciente, item.id)}
                        planejamento={planejamentoDe(paciente, item.id)}
                        onClick={() => setCelulaAtiva({ pacienteNome: paciente, item })}
                        disabled={liberado}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {resultadoDe(paciente)
                      ? <span className="font-semibold text-foreground">{money(resultadoDe(paciente)!.valor_liquido)}<span className="text-muted-foreground"> / {money(resultadoDe(paciente)!.valor_bruto)}</span></span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {celulaAtiva && celulaAtiva.item.classe === "recorrente" && (
        <PainelQuantidade
          pacienteNome={celulaAtiva.pacienteNome}
          item={celulaAtiva.item}
          competencia={competencia}
          semanasCalendario={semanasCalendario}
          registro={registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)}
          onFechar={() => setCelulaAtiva(null)}
          onSalvar={async ({ quantidadeEntregue, evidencias, observacao, motivo }) => {
            await marcarQuantidade({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              quantidadeEntregue,
              quantidadeEsperada: quantidadeEsperada(celulaAtiva.item, semanasCalendario),
              observacao,
              evidencias,
              motivo,
            })
            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onExcluir={
            registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
              ? async (motivo) => {
                  const registro = registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
                  if (!registro) return
                  await excluirRegistro({ id: registro.id, pacienteNome: celulaAtiva.pacienteNome, motivo })
                  await recalcularApuracao()
                  setCelulaAtiva(null)
                }
              : undefined
          }
        />
      )}

      {celulaAtiva && celulaAtiva.item.classe === "semestral" && (
        <PainelSemestral
          pacienteNome={celulaAtiva.pacienteNome}
          item={celulaAtiva.item}
          competencia={competencia}
          registro={registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)}
          planejamento={celulaAtiva.pacienteNome ? planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id) : null}
          onFechar={() => setCelulaAtiva(null)}
          onSalvarPlanejamento={async (competenciaPlanejada) => {
            if (!celulaAtiva.pacienteNome) return
            await cadastrarPlanejamento({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              competenciaPlanejada,
            })
            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onSalvarEntrega={async ({ status, evidencias, observacao, motivo }) => {
            const plano = celulaAtiva.pacienteNome ? planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id) : null
            const antecipada = plano && competencia < plano.competencia_planejada ? plano : null

            await marcarEntrega({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              status,
              observacao,
              evidencias,
              motivo,
            })

            // Regra: entrega semestral antecipada reprograma e recalcula a
            // próxima competência planejada (marco zero + 6 meses a partir da
            // competência em que foi de fato entregue).
            if (status === "entregue" && antecipada && celulaAtiva.pacienteNome) {
              await cadastrarPlanejamento({
                pacienteNome: celulaAtiva.pacienteNome,
                itemId: celulaAtiva.item.id,
                competenciaPlanejada: addMeses(competencia, 6),
                reprogramarDe: antecipada,
              })
            }

            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onSalvarReprogramacaoImpedimento={async ({ competenciaPlanejada, motivo, evidencias }) => {
            if (!celulaAtiva.pacienteNome) return
            const plano = planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
            await cadastrarPlanejamento({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              competenciaPlanejada,
              reprogramarDe: plano,
              origem: "reprogramacao_impedimento",
              motivo,
              evidencias,
            })
            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onExcluirEntrega={
            registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
              ? async (motivo) => {
                  const registro = registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
                  if (!registro) return
                  await excluirRegistro({ id: registro.id, pacienteNome: celulaAtiva.pacienteNome, motivo })
                  await recalcularApuracao()
                  setCelulaAtiva(null)
                }
              : undefined
          }
          onExcluirPlanejamento={
            celulaAtiva.pacienteNome
              ? async (motivo) => {
                  const plano = planejamentoDe(celulaAtiva.pacienteNome!, celulaAtiva.item.id)
                  if (!plano) return
                  const r = await excluirPlanejamento({ id: plano.id, pacienteNome: celulaAtiva.pacienteNome!, motivo })
                  if (r.ok) {
                    await recalcularApuracao()
                    setCelulaAtiva(null)
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function SeletorPrestador({ analistas, prestador, onChange }: {
  analistas: string[]; prestador: string; onChange: (v: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <label htmlFor="pep-prestador" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Analista do Comportamento
      </label>
      <select
        id="pep-prestador"
        value={prestador}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">— Selecione —</option>
        {analistas.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  )
}

type RegistroResumo = Pick<PepRegistroEntrega, "status" | "quantidade_entregue" | "evidencias" | "observacao"> | null

function temEvidencia(registro: RegistroResumo): boolean {
  return !!registro?.evidencias?.some(e => e.caminho)
}

function CelulaRecorrente({ item, semanasCalendario, registro, onClick, disabled }: {
  item: PepCatalogoItem
  semanasCalendario: number
  registro: RegistroResumo
  onClick: () => void
  disabled?: boolean
}) {
  const esperado = quantidadeEsperada(item, semanasCalendario)
  const entregue = registro?.quantidade_entregue ?? 0
  const completo = entregue >= esperado
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Faturamento liberado — reabra para editar" : item.nome}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${completo
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : entregue > 0
            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : "border-border bg-background text-muted-foreground hover:bg-muted/50"}`}
    >
      {completo ? <Check size={13} /> : null}
      {item.sigla} {entregue}/{esperado}
      {temEvidencia(registro) && <Paperclip size={11} />}
    </button>
  )
}

function CelulaSemestral({ item, competencia, registro, planejamento, onClick, disabled }: {
  item: PepCatalogoItem
  competencia: string
  registro: RegistroResumo
  planejamento: PepPlanejamentoSemestral | null
  onClick: () => void
  disabled?: boolean
}) {
  if (!planejamento) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? "Faturamento liberado — reabra para editar" : `Planejar ${item.nome}`}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CalendarPlus size={13} /> planejar
      </button>
    )
  }

  const entregue = registro?.status === "entregue"
  const vencido = !entregue && competencia >= planejamento.competencia_planejada
  const futuro = competencia < planejamento.competencia_planejada
  const mesesAtraso = mesesEntre(planejamento.competencia_planejada, competencia)
  // PRD 10.1: até 1 mês de atraso é "aceite postergado" normal (ajuste
  // estorna se aceito). A partir de 2, é pendência reiterada — sinalização
  // mais forte, risco de escalonamento contratual.
  const reiterada = vencido && mesesAtraso >= 2

  if (futuro) {
    const reprogramado = planejamento.origem === "reprogramacao_impedimento"
    return (
      <span
        className={`text-xs ${reprogramado ? "text-sky-600 dark:text-sky-400 font-medium" : "text-muted-foreground"}`}
        title={reprogramado
          ? `Reprogramação (REP-) vigente até ${planejamento.competencia_planejada} — sem ajuste enquanto vigente`
          : `Planejado para ${planejamento.competencia_planejada}`}
      >
        {reprogramado ? "REP-" : "—"}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled
        ? "Faturamento liberado — reabra para editar"
        : reiterada
          ? `${item.nome} — pendência reiterada há ${mesesAtraso} meses (PRD Seção 10.1: risco de inadimplemento de obrigação essencial)`
          : `${item.nome} — planejado ${planejamento.competencia_planejada}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${entregue
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : reiterada
            ? "border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
            : vencido
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "border-border bg-background text-muted-foreground hover:bg-muted/50"}`}
    >
      {entregue ? <Check size={13} /> : vencido ? <AlertTriangle size={13} /> : null}
      {item.sigla}
      {temEvidencia(registro) && <Paperclip size={11} />}
    </button>
  )
}

function CabecalhoPainel({ item, pacienteNome, competencia, onFechar }: {
  item: PepCatalogoItem; pacienteNome: string | null; competencia: string; onFechar: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-foreground">{item.nome}</p>
        <p className="text-xs text-muted-foreground">
          {pacienteNome ?? "Geral (sem paciente)"} · Competência {competencia}
        </p>
      </div>
      <button type="button" onClick={onFechar} className="text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </div>
  )
}

// Uma referência de evidência por unidade entregue (ex.: 2 de TAP = 2 campos
// — PRD Seção 13.6 usa nomenclatura sequencial: TAP-01-..., TAP-02-...).
function CamposEvidencia({ evidencias, onChange, rotulo }: {
  evidencias: PepEvidencia[]
  onChange: (evidencias: PepEvidencia[]) => void
  rotulo: (indice: number) => string
}) {
  function atualizar(indice: number, campo: keyof PepEvidencia, valor: string) {
    const nova = evidencias.map((e, i) => i === indice ? { ...e, [campo]: campo === "nome" && !valor ? null : valor } : e)
    onChange(nova)
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-[11px] text-muted-foreground">
        O arquivo permanece no diretório da clínica — o Pulsar guarda só a referência (PRD Seção 6).
      </p>
      {evidencias.map((ev, i) => (
        <div key={i} className="space-y-1.5">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {rotulo(i)}
          </label>
          <input
            type="text"
            placeholder="ex.: SharePoint/Pacientes/Fulano/STC-01-082026.pdf"
            value={ev.caminho}
            onChange={e => atualizar(i, "caminho", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="Nome do arquivo (opcional)"
            value={ev.nome ?? ""}
            onChange={e => atualizar(i, "nome", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      ))}
    </div>
  )
}

function limparEvidencias(evidencias: PepEvidencia[]): PepEvidencia[] {
  return evidencias.filter(e => e.caminho.trim())
}

// PRD Seção 2.3/12.3: "uma unidade só é faturável com evidência presente" —
// não é opcional. Cada unidade entregue precisa da sua própria referência de
// evidência (2 unidades de TAP = 2 evidências, não uma só pra tudo).
function evidenciasCompletas(evidencias: PepEvidencia[], quantidade: number): boolean {
  return limparEvidencias(evidencias).length >= quantidade
}

// Confirmação genérica pra salvar edição ou excluir — toda alteração manual
// exige confirmação e, quando aplicável, motivo (PRD Seção 11.4).
function ConfirmModal({ titulo, mensagem, pedirMotivo, motivo, onMotivoChange, confirmLabel, perigo, confirmDisabled, onConfirmar, onCancelar }: {
  titulo: string
  mensagem: string
  pedirMotivo: boolean
  motivo: string
  onMotivoChange: (v: string) => void
  confirmLabel: string
  perigo?: boolean
  confirmDisabled?: boolean
  onConfirmar: () => void | Promise<void>
  onCancelar: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onCancelar}>
      <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 shadow-lg space-y-3" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{mensagem}</p>
        {pedirMotivo && (
          <div className="space-y-1.5">
            <label htmlFor="pep-confirm-motivo" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Motivo
            </label>
            <textarea
              id="pep-confirm-motivo"
              value={motivo}
              onChange={e => onMotivoChange(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancelar}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground bg-background hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmDisabled || (pedirMotivo && !motivo.trim())}
            onClick={onConfirmar}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${perigo ? "bg-rose-600" : "bg-emerald-600"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function PainelQuantidade({ pacienteNome, item, competencia, semanasCalendario, registro, onFechar, onSalvar, onExcluir }: {
  pacienteNome: string | null
  item: PepCatalogoItem
  competencia: string
  semanasCalendario: number
  registro: (RegistroResumo & { observacao?: string | null }) | null
  onFechar: () => void
  onSalvar: (input: {
    quantidadeEntregue: number
    evidencias: PepEvidencia[]
    observacao: string | null
    motivo?: string | null
  }) => void | Promise<void>
  onExcluir?: (motivo: string) => void | Promise<void>
}) {
  const esperado = quantidadeEsperada(item, semanasCalendario)
  const [quantidade, setQuantidade] = useState(registro?.quantidade_entregue ?? 0)
  const [evidencias, setEvidencias] = useState<PepEvidencia[]>(
    normalizarEvidencias(registro?.evidencias ?? [], Math.max(1, registro?.quantidade_entregue ?? 0))
  )
  const [observacao, setObservacao] = useState(registro?.observacao ?? "")
  const [confirmando, setConfirmando] = useState<"salvar" | "excluir" | null>(null)
  const [motivo, setMotivo] = useState("")
  const jaExiste = !!registro

  function alterarQuantidade(nova: number) {
    const clamped = Math.max(0, Math.min(esperado, nova))
    setQuantidade(clamped)
    setEvidencias(prev => normalizarEvidencias(prev, Math.max(1, clamped)))
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CabecalhoPainel item={item} pacienteNome={pacienteNome} competencia={competencia} onFechar={onFechar} />

        <div className="space-y-2 border-t border-border pt-3">
          <label htmlFor="pep-quantidade" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quantidade entregue no mês (de {esperado} esperada{esperado > 1 ? "s" : ""})
          </label>
          <input
            id="pep-quantidade"
            type="number"
            min={0}
            max={esperado}
            value={quantidade}
            onChange={e => alterarQuantidade(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        {quantidade > 0 && (
          <CamposEvidencia
            evidencias={evidencias}
            onChange={setEvidencias}
            rotulo={i => esperado > 1 ? `Referência da evidência — unidade ${i + 1} de ${quantidade}` : "Referência da evidência"}
          />
        )}

        <div className="space-y-2">
          <label htmlFor="pep-observacao" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Observação
          </label>
          <textarea
            id="pep-observacao"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        {quantidade > 0 && !evidenciasCompletas(evidencias, quantidade) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Cada unidade entregue precisa de uma referência de evidência preenchida (PRD Seção 2.3/12.3) — sem isso a unidade não é faturável.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            disabled={quantidade > 0 && !evidenciasCompletas(evidencias, quantidade)}
            onClick={() => jaExiste ? setConfirmando("salvar") : onSalvar({ quantidadeEntregue: quantidade, evidencias: limparEvidencias(evidencias), observacao: observacao || null })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            <Check size={14} /> Salvar quantidade
          </button>
          {jaExiste && onExcluir && (
            <button
              type="button"
              onClick={() => setConfirmando("excluir")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-rose-300 text-rose-700 dark:text-rose-400 bg-background hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}
        </div>
      </div>

      {confirmando === "salvar" && (
        <ConfirmModal
          titulo="Salvar alterações?"
          mensagem="Este registro já existia — a quantidade e a evidência serão sobrescritas."
          pedirMotivo
          motivo={motivo}
          onMotivoChange={setMotivo}
          confirmLabel="Salvar alterações"
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await onSalvar({ quantidadeEntregue: quantidade, evidencias: limparEvidencias(evidencias), observacao: observacao || null, motivo })
            setConfirmando(null)
          }}
        />
      )}
      {confirmando === "excluir" && onExcluir && (
        <ConfirmModal
          titulo="Excluir este registro?"
          mensagem="A quantidade entregue e a evidência deste item nesta competência serão apagadas. Essa ação fica registrada na trilha de auditoria."
          pedirMotivo
          motivo={motivo}
          onMotivoChange={setMotivo}
          confirmLabel="Excluir"
          perigo
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await onExcluir(motivo)
            setConfirmando(null)
          }}
        />
      )}
    </div>
  )
}

function PainelSemestral({ pacienteNome, item, competencia, registro, planejamento, onFechar, onSalvarPlanejamento, onSalvarEntrega, onSalvarReprogramacaoImpedimento, onExcluirEntrega, onExcluirPlanejamento }: {
  pacienteNome: string | null
  item: PepCatalogoItem
  competencia: string
  registro: (RegistroResumo & { observacao?: string | null }) | null
  planejamento: PepPlanejamentoSemestral | null
  onFechar: () => void
  onSalvarPlanejamento: (competenciaPlanejada: string) => void | Promise<void>
  onSalvarEntrega: (input: {
    status: "pendente" | "entregue"
    evidencias: PepEvidencia[]
    observacao: string | null
    motivo?: string | null
  }) => void | Promise<void>
  onSalvarReprogramacaoImpedimento: (input: {
    competenciaPlanejada: string
    motivo: string
    evidencias: PepEvidencia[]
  }) => void | Promise<void>
  onExcluirEntrega?: (motivo: string) => void | Promise<void>
  onExcluirPlanejamento?: (motivo: string) => void | Promise<void>
}) {
  const [evidencias, setEvidencias] = useState<PepEvidencia[]>(normalizarEvidencias(registro?.evidencias ?? [], 1))
  const [observacao, setObservacao] = useState(registro?.observacao ?? "")
  const [competenciaPlanejada, setCompetenciaPlanejada] = useState(planejamento?.competencia_planejada ?? competencia)
  const [mostrarRep, setMostrarRep] = useState(false)
  const [repCompetencia, setRepCompetencia] = useState(planejamento?.competencia_planejada ?? competencia)
  const [repMotivo, setRepMotivo] = useState("")
  const [repEvidencias, setRepEvidencias] = useState<PepEvidencia[]>(normalizarEvidencias([], 1))
  const [confirmando, setConfirmando] = useState<"salvar" | "excluirEntrega" | "excluirPlanejamento" | null>(null)
  const [motivo, setMotivo] = useState("")
  const jaExiste = !!registro

  if (!planejamento) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
          <CabecalhoPainel item={item} pacienteNome={pacienteNome} competencia={competencia} onFechar={onFechar} />
          <div className="space-y-2 border-t border-border pt-3">
            <label htmlFor="pep-plano-competencia" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Competência planejada
            </label>
            <input
              id="pep-plano-competencia"
              type="month"
              value={competenciaPlanejada}
              onChange={e => setCompetenciaPlanejada(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => onSalvarPlanejamento(competenciaPlanejada)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#222847] dark:bg-slate-600 hover:opacity-90"
            >
              <CalendarPlus size={14} /> Salvar planejamento
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CabecalhoPainel item={item} pacienteNome={pacienteNome} competencia={competencia} onFechar={onFechar} />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Planejado para {planejamento.competencia_planejada}
          </p>
          {onExcluirPlanejamento && (
            <button
              type="button"
              onClick={() => setConfirmando("excluirPlanejamento")}
              title="Excluir planejamento"
              className="text-rose-600 dark:text-rose-400 hover:text-rose-700"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        <CamposEvidencia evidencias={evidencias} onChange={setEvidencias} rotulo={() => "Referência da evidência"} />

        {!evidenciasCompletas(evidencias, 1) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Evidência obrigatória para marcar como entregue (PRD Seção 2.3/12.3) — sem ela a unidade não é faturável.
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="pep-observacao" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Observação
          </label>
          <textarea
            id="pep-observacao"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            disabled={!evidenciasCompletas(evidencias, 1)}
            onClick={() => jaExiste
              ? setConfirmando("salvar")
              : onSalvarEntrega({ status: "entregue", evidencias: limparEvidencias(evidencias), observacao: observacao || null })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            <Check size={14} /> Marcar entregue
          </button>
          {registro?.status === "entregue" && (
            <button
              type="button"
              onClick={() => onSalvarEntrega({ status: "pendente", evidencias: [], observacao: observacao || null })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-border text-foreground bg-background hover:bg-muted/50"
            >
              Desfazer
            </button>
          )}
          {jaExiste && onExcluirEntrega && (
            <button
              type="button"
              onClick={() => setConfirmando("excluirEntrega")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-rose-300 text-rose-700 dark:text-rose-400 bg-background hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}
        </div>

        {registro?.status !== "entregue" && (
          <div className="border-t border-border pt-3 space-y-3">
            <button
              type="button"
              onClick={() => setMostrarRep(v => !v)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground underline decoration-dotted"
            >
              {mostrarRep ? "Cancelar reprogramação" : "Impedimento terapêutico? Registrar reprogramação (REP-)"}
            </button>

            {mostrarRep && (
              <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
                <p className="text-[11px] text-muted-foreground">
                  PRD Seção 9.7 — aceito o relatório de reprogramação, o ajuste fica suspenso até a nova competência planejada.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="pep-rep-competencia" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Nova competência planejada
                  </label>
                  <input
                    id="pep-rep-competencia"
                    type="month"
                    value={repCompetencia}
                    onChange={e => setRepCompetencia(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pep-rep-motivo" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Motivos e justificativas técnicas
                  </label>
                  <textarea
                    id="pep-rep-motivo"
                    value={repMotivo}
                    onChange={e => setRepMotivo(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <CamposEvidencia
                  evidencias={repEvidencias}
                  onChange={setRepEvidencias}
                  rotulo={() => `Referência do relatório (ex.: REP-${item.sigla}-PACIENTE-${repCompetencia.replace("-", "")})`}
                />
                <button
                  type="button"
                  disabled={!repMotivo.trim() || !evidenciasCompletas(repEvidencias, 1)}
                  onClick={() => onSalvarReprogramacaoImpedimento({
                    competenciaPlanejada: repCompetencia,
                    motivo: repMotivo.trim(),
                    evidencias: limparEvidencias(repEvidencias),
                  })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#222847] dark:bg-slate-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CalendarPlus size={14} /> Aceitar reprogramação
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmando === "salvar" && (
        <ConfirmModal
          titulo="Salvar alterações?"
          mensagem="Este registro já existia — o status e a evidência serão sobrescritos."
          pedirMotivo
          motivo={motivo}
          onMotivoChange={setMotivo}
          confirmLabel="Salvar alterações"
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await onSalvarEntrega({ status: "entregue", evidencias: limparEvidencias(evidencias), observacao: observacao || null, motivo })
            setConfirmando(null)
          }}
        />
      )}
      {confirmando === "excluirEntrega" && onExcluirEntrega && (
        <ConfirmModal
          titulo="Excluir este registro?"
          mensagem="O status de entrega e a evidência deste item nesta competência serão apagados. Essa ação fica registrada na trilha de auditoria."
          pedirMotivo
          motivo={motivo}
          onMotivoChange={setMotivo}
          confirmLabel="Excluir"
          perigo
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await onExcluirEntrega(motivo)
            setConfirmando(null)
          }}
        />
      )}
      {confirmando === "excluirPlanejamento" && onExcluirPlanejamento && (
        <ConfirmModal
          titulo="Excluir o planejamento?"
          mensagem="A competência planejada deste item some para este paciente. Se este planejamento já foi reprogramado antes, a exclusão pode ser bloqueada para preservar o histórico."
          pedirMotivo
          motivo={motivo}
          onMotivoChange={setMotivo}
          confirmLabel="Excluir"
          perigo
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await onExcluirPlanejamento(motivo)
            setConfirmando(null)
          }}
        />
      )}
    </div>
  )
}
