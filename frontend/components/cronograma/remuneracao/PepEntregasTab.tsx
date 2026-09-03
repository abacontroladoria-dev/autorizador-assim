"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Paperclip, Check, AlertTriangle, CalendarPlus, X, Trash2, History, Loader2 } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { useParametrosGerais } from "@/hooks/useParametrosGerais"
import { usePepEntregas } from "@/hooks/usePepEntregas"
import { usePepApuracao } from "@/hooks/usePepApuracao"
import { usePepCalendario } from "@/hooks/usePepCalendario"
import { periodoDoMes } from "@/hooks/useRemuneracao"
import { SeletorMesPrevisao } from "@/components/cronograma/indicadores/SeletorMesPrevisao"
import { DatePicker } from "@/components/ui/date-picker"
import { PepHistoricoModal } from "./PepHistoricoModal"
import { COMPETENCIA_TESTE_PEP } from "@/lib/remuneracao/calculoPEP"
import type { PepCatalogoItem, PepEvidencia, PepPlanejamentoSemestral, PepRegistroEntrega } from "@/types/pep"

const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'. Sem hora em nenhum lugar (PRD §2.2). */
function formatarDataBR(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.split("-")
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "—"
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. A competência é sempre DERIVADA da data (PRD §2.2/§3/§6), nunca o contrário. */
function competenciaDaData(iso: string): string {
  return iso.slice(0, 7)
}

function competenciaDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function addMeses(competencia: string, meses: number): string {
  const [y, m] = competencia.split("-").map(Number)
  const d = new Date(y, m - 1 + meses, 1)
  return competenciaDoMes(d)
}

// Quantidade esperada no mês para um item recorrente. PRD Seção 9.11: só os
// itens SEMANAIS (Supervisão/Estudo) variam com o calendário — calculado
// automaticamente a partir dos feriados (usePepCalendario). TAP/Parental usam
// sempre a referência fixa do catálogo (Seção 7.2).
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

// Fecha o modal só quando o próprio backdrop foi pressionado E solto — não
// quando o usuário estava selecionando texto (ex.: arrastando o mouse pra
// selecionar tudo na Observação) e soltou fora do card. Sem isso, o "click"
// do navegador é computado no backdrop mesmo o gesto tendo começado dentro,
// e o modal fechava no meio da seleção.
function useFecharAoClicarFora(onFechar: () => void) {
  const pressionouNoBackdrop = useRef(false)
  return {
    onMouseDown: (e: React.MouseEvent) => { pressionouNoBackdrop.current = e.target === e.currentTarget },
    onClick: () => { if (pressionouNoBackdrop.current) onFechar() },
  }
}

function SecaoTitulo({ numero, children, nota }: { numero: number; children: React.ReactNode; nota?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#222847] text-[11px] font-bold text-white dark:bg-slate-600">
        {numero}
      </span>
      <h2 className="text-sm font-bold text-foreground">{children}</h2>
      {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
    </div>
  )
}

export function PepEntregasTab() {
  const { resultado, controlesGrade } = useRemuneracaoRPContext()
  const { setHeader, setRightContent } = useHeader()

  const [prestador, setPrestador] = useState("")
  const [celulaAtiva, setCelulaAtiva] = useState<CelulaAtiva>(null)
  const [historicoAberto, setHistoricoAberto] = useState<"prestador" | "geral" | null>(null)

  // Um único seletor de mês pra tela inteira — o de "Entregas mensais" abaixo.
  // `controlesGrade.periodo` já é a mesma "competência que fechou" por
  // padrão (mesFechadoAnterior em useRemuneracao.ts); não existe mais um
  // segundo estado de mês no cabeçalho pra manter sincronizado.
  const competencia = controlesGrade.periodo.de.slice(0, 7)
  const { carregarGradeAuto, carregarGradeDoBanco, gradeLoading, gradeErroResumo } = controlesGrade
  const { semanas: semanasCalendario, calculadoAutomaticamente, loading: calendarioCarregando } = usePepCalendario(competencia)

  // Primeira carga da Grade — mesmo gatilho que RemuneracaoUploadBadges usava
  // no cabeçalho; guardado por ref lá dentro, então é seguro chamar de novo.
  useEffect(() => { carregarGradeAuto() }, [carregarGradeAuto])

  // A Grade carregada aqui alimenta o mesmo contexto compartilhado das abas
  // Rem. Mês - Total e Individual — não precisa reanexar ao trocar de aba.
  // Sem seletor de mês no cabeçalho nesta tela: o mês é escolhido só em
  // "Entregas mensais", que já recarrega a Grade junto (ver onChange abaixo).
  useEffect(() => {
    setHeader("Entregas PEP", "Relacionamento Prestador")
    setRightContent(null)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent])

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
    registroDe, registroSemestralDe, planejamentoDe,
    marcarEntrega, marcarQuantidade, cadastrarPlanejamento,
    excluirRegistro, excluirPlanejamento,
  } = usePepEntregas(prestador, competencia)

  const { parametros } = useParametrosGerais()
  const valorMensalPorPaciente = parametros?.cc_pe_default ?? 0
  const pacientesApuracao = useMemo(() => pacientes.map(nome => ({ nome })), [pacientes])
  const { resultadoDe, totalPrestador, loading: apuracaoLoading, recalcular: recalcularApuracao, liberado, liberar, reabrir } = usePepApuracao(
    prestador, competencia, pacientesApuracao, valorMensalPorPaciente
  )
  const [confirmandoLiberar, setConfirmandoLiberar] = useState(false)
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false)
  const [motivoReabrir, setMotivoReabrir] = useState("")

  const itensGerais = itensRecorrentes.filter(i => i.tipo_registro === "GERAL")
  const itensPorPaciente = itensRecorrentes.filter(i => i.tipo_registro === "POR_PACIENTE")

  const catalogoCompleto = useMemo(() => [...itensRecorrentes, ...itensSemestrais], [itensRecorrentes, itensSemestrais])

  if (!prestador) {
    return (
      <div className="space-y-5">
        <SeletorPrestador analistas={analistas} prestador={prestador} onChange={setPrestador} onHistoricoGeral={() => setHistoricoAberto("geral")} />
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {analistas.length === 0
            ? "Nenhum Analista do Comportamento encontrado. Faça o upload da Grade no botão acima para carregar a lista de prestadores e pacientes."
            : "Selecione um Analista do Comportamento acima para registrar as entregas da PEP."}
        </div>
        {historicoAberto === "geral" && (
          <PepHistoricoModal catalogo={catalogoCompleto} onClose={() => setHistoricoAberto(null)} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SecaoTitulo numero={1}>Analista do Comportamento</SecaoTitulo>
      <SeletorPrestador
        analistas={analistas}
        prestador={prestador}
        onChange={setPrestador}
        onHistoricoGeral={() => setHistoricoAberto("geral")}
        onHistoricoPrestador={() => setHistoricoAberto("prestador")}
      />

      <SecaoTitulo numero={2}>Entregas mensais</SecaoTitulo>
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Competência
            </span>
            <SeletorMesPrevisao
              ano={Number(competencia.split("-")[0])}
              mes={Number(competencia.split("-")[1])}
              onChange={(ano, mes) => carregarGradeDoBanco(periodoDoMes(ano, mes))}
            />
            {(salvando || gradeLoading || apuracaoLoading) && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                {gradeLoading ? "Carregando grade…" : salvando ? "Salvando…" : "Atualizando valores apurados…"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground" title="PRD Seção 9.11/13.8 — calculado a partir do calendário de feriados. Só afeta Supervisão/Estudo Técnico.">
            {calendarioCarregando
              ? "Calculando semanas do mês…"
              : `Semanas no mês (Sup./Estudo): ${semanasCalendario} — ${calculadoAutomaticamente ? "calculado automaticamente pelo calendário de feriados" : "ajuste publicado manualmente"}.`}
          </p>
          {gradeErroResumo && <p className="text-sm text-red-600 dark:text-red-400">{gradeErroResumo}</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {competencia === COMPETENCIA_TESTE_PEP && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <span className="font-bold">Modo teste (PRD Seção 13.7):</span> {COMPETENCIA_TESTE_PEP} apura e demonstra os descontos, mas paga 100% do potencial — por isso "Alcançado" ainda não reflete pendências. Os ajustes passam a valer a partir do mês seguinte.
          </div>
        )}

        {valorMensalPorPaciente > 0 && pacientes.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center gap-6 flex-wrap">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Potencial do mês
                {apuracaoLoading && <Loader2 size={11} className="animate-spin" />}
              </p>
              <p className={`text-lg font-bold text-foreground transition-opacity ${apuracaoLoading ? "opacity-40" : ""}`}>
                {money(pacientes.length * valorMensalPorPaciente)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Alcançado (apurado)
                {apuracaoLoading && <Loader2 size={11} className="animate-spin" />}
              </p>
              <p className={`text-lg font-bold text-emerald-600 dark:text-emerald-400 transition-opacity ${apuracaoLoading ? "opacity-40" : ""}`}>
                {money(totalPrestador)}
              </p>
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
                  disabled={apuracaoLoading}
                  title={apuracaoLoading ? "Aguarde a apuração terminar de calcular" : undefined}
                  onClick={() => setConfirmandoLiberar(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
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
                  <th className="px-3 py-3 font-semibold text-muted-foreground text-right">
                    <span className="inline-flex items-center gap-1.5">
                      PEP apurada
                      {apuracaoLoading && <Loader2 size={11} className="animate-spin" />}
                    </span>
                  </th>
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
                    <td className={`px-3 py-3 text-right whitespace-nowrap transition-opacity ${apuracaoLoading ? "opacity-40" : ""}`}>
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
      </div>

      <SecaoTitulo numero={3} nota="independe do mês acima — vale para o ano inteiro (PRD §7.2)">
        Entregas semestrais
      </SecaoTitulo>
      {pacientes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum paciente encontrado para este Analista na Grade carregada.
        </div>
      ) : (
        <div className="space-y-4">
          {pacientes.map(paciente => (
            <TabelaSemestralPaciente
              key={paciente}
              paciente={paciente}
              itensSemestrais={itensSemestrais}
              planejamentoDe={planejamentoDe}
              registroSemestralDe={registroSemestralDe}
              onAbrirPainel={item => setCelulaAtiva({ pacienteNome: paciente, item })}
              disabled={liberado}
            />
          ))}
        </div>
      )}

      {celulaAtiva && celulaAtiva.item.classe === "recorrente" && (
        <PainelQuantidade
          pacienteNome={celulaAtiva.pacienteNome}
          item={celulaAtiva.item}
          competencia={competencia}
          semanasCalendario={semanasCalendario}
          registro={registroDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)}
          erro={error}
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
                  if (!registro) return false
                  const r = await excluirRegistro({ id: registro.id, pacienteNome: celulaAtiva.pacienteNome, motivo })
                  if (r.ok) {
                    await recalcularApuracao()
                    setCelulaAtiva(null)
                  }
                  return r.ok
                }
              : undefined
          }
        />
      )}

      {celulaAtiva && celulaAtiva.item.classe === "semestral" && (
        <PainelSemestral
          pacienteNome={celulaAtiva.pacienteNome}
          item={celulaAtiva.item}
          registro={registroSemestralDe(celulaAtiva.pacienteNome ?? "", celulaAtiva.item.id)}
          planejamento={celulaAtiva.pacienteNome ? planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id) : null}
          erro={error}
          onFechar={() => setCelulaAtiva(null)}
          onSalvarPlanejamento={async (dataPlanejada) => {
            if (!celulaAtiva.pacienteNome) return
            await cadastrarPlanejamento({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              competenciaPlanejada: competenciaDaData(dataPlanejada),
              dataPlanejada,
            })
            await recalcularApuracao()
            // Mantém o painel aberto — o planejamento recém-criado já habilita
            // a próxima etapa (observação/evidência) sem forçar reabrir o modal.
          }}
          onSalvarEntrega={async ({ status, evidencias, observacao, motivo, dataEntrega }) => {
            const plano = celulaAtiva.pacienteNome ? planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id) : null
            const competenciaEntrega = competenciaDaData(dataEntrega)
            const antecipada = plano && competenciaEntrega < plano.competencia_planejada ? plano : null

            await marcarEntrega({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              status,
              observacao,
              evidencias,
              motivo,
              competencia: competenciaEntrega,
              dataEntrega,
            })

            // Regra: entrega semestral antecipada reprograma e recalcula a
            // próxima competência planejada (marco zero + 6 meses a partir da
            // competência em que foi de fato entregue).
            if (status === "entregue" && antecipada && celulaAtiva.pacienteNome) {
              const proximaCompetencia = addMeses(competenciaEntrega, 6)
              await cadastrarPlanejamento({
                pacienteNome: celulaAtiva.pacienteNome,
                itemId: celulaAtiva.item.id,
                competenciaPlanejada: proximaCompetencia,
                dataPlanejada: `${proximaCompetencia}-01`,
                reprogramarDe: antecipada,
              })
            }

            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onSalvarReprogramacaoImpedimento={async ({ dataPlanejada, motivo, evidencias }) => {
            if (!celulaAtiva.pacienteNome) return
            const plano = planejamentoDe(celulaAtiva.pacienteNome, celulaAtiva.item.id)
            await cadastrarPlanejamento({
              pacienteNome: celulaAtiva.pacienteNome,
              itemId: celulaAtiva.item.id,
              competenciaPlanejada: competenciaDaData(dataPlanejada),
              dataPlanejada,
              reprogramarDe: plano,
              origem: "reprogramacao_impedimento",
              motivo,
              evidencias,
            })
            await recalcularApuracao()
            setCelulaAtiva(null)
          }}
          onExcluirEntrega={
            registroSemestralDe(celulaAtiva.pacienteNome ?? "", celulaAtiva.item.id)
              ? async (motivo) => {
                  const registro = registroSemestralDe(celulaAtiva.pacienteNome ?? "", celulaAtiva.item.id)
                  if (!registro) return false
                  const r = await excluirRegistro({ id: registro.id, pacienteNome: celulaAtiva.pacienteNome, motivo })
                  if (r.ok) {
                    await recalcularApuracao()
                    setCelulaAtiva(null)
                  }
                  return r.ok
                }
              : undefined
          }
          onExcluirPlanejamento={
            celulaAtiva.pacienteNome
              ? async (motivo) => {
                  const plano = planejamentoDe(celulaAtiva.pacienteNome!, celulaAtiva.item.id)
                  if (!plano) return false
                  const r = await excluirPlanejamento({ id: plano.id, pacienteNome: celulaAtiva.pacienteNome!, motivo })
                  if (r.ok) {
                    await recalcularApuracao()
                    setCelulaAtiva(null)
                  }
                  return r.ok
                }
              : undefined
          }
        />
      )}

      {historicoAberto && (
        <PepHistoricoModal
          prestadorNome={historicoAberto === "prestador" ? prestador : undefined}
          catalogo={catalogoCompleto}
          onClose={() => setHistoricoAberto(null)}
        />
      )}
    </div>
  )
}

function SeletorPrestador({ analistas, prestador, onChange, onHistoricoGeral, onHistoricoPrestador }: {
  analistas: string[]
  prestador: string
  onChange: (v: string) => void
  onHistoricoGeral: () => void
  onHistoricoPrestador?: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor="pep-prestador" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Analista do Comportamento
        </label>
        <div className="flex items-center gap-2">
          {onHistoricoPrestador && (
            <button
              type="button"
              onClick={onHistoricoPrestador}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <History size={12} /> Histórico
            </button>
          )}
          <button
            type="button"
            onClick={onHistoricoGeral}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            <History size={12} /> Histórico geral
          </button>
        </div>
      </div>
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

type RegistroResumo = Pick<PepRegistroEntrega, "status" | "quantidade_entregue" | "evidencias" | "observacao" | "data_entrega"> | null

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

// PRD §7.2 — tabela por paciente das 3 entregas semestrais (OE/RT/PIC),
// independente do mês selecionado na aba mensal. Substitui as colunas de
// badge que existiam antes na tabela mensal.
function TabelaSemestralPaciente({ paciente, itensSemestrais, planejamentoDe, registroSemestralDe, onAbrirPainel, disabled }: {
  paciente: string
  itensSemestrais: PepCatalogoItem[]
  planejamentoDe: (pacienteNome: string, itemId: string) => PepPlanejamentoSemestral | null
  registroSemestralDe: (pacienteNome: string, itemId: string) => RegistroResumo
  onAbrirPainel: (item: PepCatalogoItem) => void
  disabled?: boolean
}) {
  const hoje = competenciaDoMes(new Date())

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <p className="px-4 py-3 text-sm font-bold text-foreground border-b border-border">{paciente}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2 font-semibold text-muted-foreground">Documento</th>
            <th className="px-3 py-2 font-semibold text-muted-foreground">Data planejada</th>
            <th className="px-3 py-2 font-semibold text-muted-foreground">Data de entrega</th>
            <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
            <th className="px-3 py-2 font-semibold text-muted-foreground">Link da evidência</th>
          </tr>
        </thead>
        <tbody>
          {itensSemestrais.map(item => {
            const plano = planejamentoDe(paciente, item.id)
            const registro = registroSemestralDe(paciente, item.id)
            const entregue = registro?.status === "entregue"
            const link = registro?.evidencias?.find(e => e.caminho)?.caminho ?? null

            let statusLabel = "Sem planejamento"
            let statusTone = "text-muted-foreground"
            if (plano) {
              if (entregue) {
                const retroativo = !!(registro?.data_entrega && plano.data_planejada && registro.data_entrega > plano.data_planejada)
                statusLabel = retroativo ? "Realizado (retroativo)" : "Realizado"
                statusTone = "text-emerald-700 dark:text-emerald-400 font-medium"
              } else {
                const dataPlanejadaComp = plano.data_planejada ? competenciaDaData(plano.data_planejada) : plano.competencia_planejada
                const vencido = dataPlanejadaComp <= hoje
                const reiterada = vencido && mesesEntre(dataPlanejadaComp, hoje) >= 2
                const reprogramado = plano.origem === "reprogramacao_impedimento" && !vencido
                statusLabel = reprogramado ? "Reprogramado (REP-)" : reiterada ? "Pendência reiterada" : vencido ? "Vencido" : "Pendente"
                statusTone = reprogramado
                  ? "text-sky-600 dark:text-sky-400 font-medium"
                  : reiterada
                    ? "text-rose-600 dark:text-rose-400 font-bold"
                    : vencido
                      ? "text-amber-700 dark:text-amber-400 font-medium"
                      : "text-muted-foreground"
              }
            }

            return (
              <tr
                key={item.id}
                onClick={() => !disabled && onAbrirPainel(item)}
                className={`border-b border-border last:border-0 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/40"}`}
                title={disabled ? "Faturamento liberado — reabra para editar" : item.nome}
              >
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {item.nome} <span className="text-muted-foreground">({item.sigla})</span>
                </td>
                <td className="px-3 py-2.5 text-foreground">{plano ? formatarDataBR(plano.data_planejada) : "—"}</td>
                <td className="px-3 py-2.5 text-foreground">{entregue ? formatarDataBR(registro?.data_entrega) : "—"}</td>
                <td className={`px-3 py-2.5 ${statusTone}`}>
                  <span className="inline-flex items-center gap-1">
                    {entregue ? <Check size={13} /> : plano && statusLabel !== "Pendente" ? <AlertTriangle size={13} /> : plano ? null : <CalendarPlus size={13} />}
                    {plano ? statusLabel : "Planejar"}
                  </span>
                </td>
                <td className="px-3 py-2.5 max-w-[240px] truncate text-muted-foreground" title={link ?? undefined}>
                  {link ?? "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CabecalhoPainel({ item, pacienteNome, competencia, onFechar }: {
  item: PepCatalogoItem; pacienteNome: string | null; competencia?: string; onFechar: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-foreground">{item.nome}</p>
        <p className="text-xs text-muted-foreground">
          {pacienteNome ?? "Geral (sem paciente)"}{competencia ? ` · Competência ${competencia}` : ""}
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
function ConfirmModal({ titulo, mensagem, pedirMotivo, motivo, onMotivoChange, confirmLabel, perigo, confirmDisabled, erro, onConfirmar, onCancelar }: {
  titulo: string
  mensagem: string
  pedirMotivo: boolean
  motivo: string
  onMotivoChange: (v: string) => void
  confirmLabel: string
  perigo?: boolean
  confirmDisabled?: boolean
  erro?: string | null
  onConfirmar: () => void | Promise<void>
  onCancelar: () => void
}) {
  const backdrop = useFecharAoClicarFora(onCancelar)
  // Toda confirmação daqui dispara pelo menos um save + um recálculo de
  // apuração — sem isso o botão parecia travado (clicável de novo, sem
  // nenhum sinal) enquanto a promise corria por baixo.
  const [processando, setProcessando] = useState(false)
  async function confirmar() {
    setProcessando(true)
    try {
      await onConfirmar()
    } finally {
      setProcessando(false)
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" {...backdrop}>
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
        {erro && <p className="text-xs font-medium text-red-600 dark:text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancelar}
            disabled={processando}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmDisabled || processando || (pedirMotivo && !motivo.trim())}
            onClick={confirmar}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${perigo ? "bg-rose-600" : "bg-emerald-600"}`}
          >
            {processando && <Loader2 size={12} className="animate-spin" />}
            {processando ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function PainelQuantidade({ pacienteNome, item, competencia, semanasCalendario, registro, erro, onFechar, onSalvar, onExcluir }: {
  pacienteNome: string | null
  item: PepCatalogoItem
  competencia: string
  semanasCalendario: number
  registro: (RegistroResumo & { observacao?: string | null }) | null
  erro?: string | null
  onFechar: () => void
  onSalvar: (input: {
    quantidadeEntregue: number
    evidencias: PepEvidencia[]
    observacao: string | null
    motivo?: string | null
  }) => void | Promise<void>
  onExcluir?: (motivo: string) => boolean | Promise<boolean>
}) {
  const esperado = quantidadeEsperada(item, semanasCalendario)
  const [quantidade, setQuantidade] = useState(registro?.quantidade_entregue ?? 0)
  const [evidencias, setEvidencias] = useState<PepEvidencia[]>(
    normalizarEvidencias(registro?.evidencias ?? [], Math.max(1, registro?.quantidade_entregue ?? 0))
  )
  const [observacao, setObservacao] = useState(registro?.observacao ?? "")
  const [confirmando, setConfirmando] = useState<"salvar" | "excluir" | null>(null)
  const [motivo, setMotivo] = useState("")
  const [salvandoDireto, setSalvandoDireto] = useState(false)
  const jaExiste = !!registro
  const backdrop = useFecharAoClicarFora(onFechar)

  function alterarQuantidade(nova: number) {
    const clamped = Math.max(0, Math.min(esperado, nova))
    setQuantidade(clamped)
    setEvidencias(prev => normalizarEvidencias(prev, Math.max(1, clamped)))
  }

  // Sem confirmação prévia (registro novo) — o próprio botão precisa avisar
  // que está em andamento, senão o clique parece não ter feito nada durante
  // o save + recálculo de apuração por baixo.
  async function salvarDireto() {
    setSalvandoDireto(true)
    try {
      await onSalvar({ quantidadeEntregue: quantidade, evidencias: limparEvidencias(evidencias), observacao: observacao || null })
    } finally {
      setSalvandoDireto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
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
            disabled={salvandoDireto || (quantidade > 0 && !evidenciasCompletas(evidencias, quantidade))}
            onClick={() => jaExiste ? setConfirmando("salvar") : salvarDireto()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            {salvandoDireto ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvandoDireto ? "Salvando…" : "Salvar quantidade"}
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
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            const ok = await onExcluir(motivo)
            if (ok) setConfirmando(null)
          }}
        />
      )}
    </div>
  )
}

function PainelSemestral({ pacienteNome, item, registro, planejamento, erro, onFechar, onSalvarPlanejamento, onSalvarEntrega, onSalvarReprogramacaoImpedimento, onExcluirEntrega, onExcluirPlanejamento }: {
  pacienteNome: string | null
  item: PepCatalogoItem
  registro: (RegistroResumo & { observacao?: string | null }) | null
  planejamento: PepPlanejamentoSemestral | null
  erro?: string | null
  onFechar: () => void
  onSalvarPlanejamento: (dataPlanejada: string) => void | Promise<void>
  onSalvarEntrega: (input: {
    status: "pendente" | "entregue"
    evidencias: PepEvidencia[]
    observacao: string | null
    motivo?: string | null
    dataEntrega: string
  }) => void | Promise<void>
  onSalvarReprogramacaoImpedimento: (input: {
    dataPlanejada: string
    motivo: string
    evidencias: PepEvidencia[]
  }) => void | Promise<void>
  onExcluirEntrega?: (motivo: string) => boolean | Promise<boolean>
  onExcluirPlanejamento?: (motivo: string) => boolean | Promise<boolean>
}) {
  const hojeISO = new Date().toISOString().slice(0, 10)
  const [evidencias, setEvidencias] = useState<PepEvidencia[]>(normalizarEvidencias(registro?.evidencias ?? [], 1))
  const [observacao, setObservacao] = useState(registro?.observacao ?? "")
  const [dataPlanejadaInput, setDataPlanejadaInput] = useState(planejamento?.data_planejada ?? "")
  const [dataEntregaInput, setDataEntregaInput] = useState(registro?.data_entrega ?? hojeISO)
  const [mostrarRep, setMostrarRep] = useState(false)
  const [repDataPlanejada, setRepDataPlanejada] = useState(planejamento?.data_planejada ?? "")
  const [repMotivo, setRepMotivo] = useState("")
  const [repEvidencias, setRepEvidencias] = useState<PepEvidencia[]>(normalizarEvidencias([], 1))
  const [confirmando, setConfirmando] = useState<"salvar" | "excluirEntrega" | "excluirPlanejamento" | null>(null)
  const [motivo, setMotivo] = useState("")
  // Ações diretas (sem passar por ConfirmModal) que ainda assim disparam
  // save + recálculo de apuração por baixo — sem isso o botão parecia
  // travado durante essa espera.
  const [salvandoDireto, setSalvandoDireto] = useState(false)
  const jaExiste = !!registro
  const backdrop = useFecharAoClicarFora(onFechar)

  async function executarDireto(acao: () => void | Promise<void>) {
    setSalvandoDireto(true)
    try {
      await acao()
    } finally {
      setSalvandoDireto(false)
    }
  }

  if (!planejamento) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
          <CabecalhoPainel item={item} pacienteNome={pacienteNome} onFechar={onFechar} />
          <div className="space-y-2 border-t border-border pt-3">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data planejada
            </label>
            <DatePicker value={dataPlanejadaInput} onChange={setDataPlanejadaInput} />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={salvandoDireto || !dataPlanejadaInput}
              onClick={() => executarDireto(() => onSalvarPlanejamento(dataPlanejadaInput))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#222847] dark:bg-slate-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {salvandoDireto ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
              {salvandoDireto ? "Salvando…" : "Salvar planejamento"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CabecalhoPainel item={item} pacienteNome={pacienteNome} onFechar={onFechar} />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Planejado para {formatarDataBR(planejamento.data_planejada)}
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

        {!jaExiste && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data de entrega
            </label>
            <DatePicker value={dataEntregaInput} onChange={setDataEntregaInput} />
          </div>
        )}

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
            disabled={salvandoDireto || !evidenciasCompletas(evidencias, 1) || !dataEntregaInput}
            onClick={() => jaExiste
              ? setConfirmando("salvar")
              : executarDireto(() => onSalvarEntrega({ status: "entregue", evidencias: limparEvidencias(evidencias), observacao: observacao || null, dataEntrega: dataEntregaInput }))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            {salvandoDireto ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvandoDireto ? "Salvando…" : "Marcar entregue"}
          </button>
          {registro?.status === "entregue" && (
            <button
              type="button"
              disabled={salvandoDireto}
              onClick={() => executarDireto(() => onSalvarEntrega({ status: "pendente", evidencias: [], observacao: observacao || null, dataEntrega: dataEntregaInput }))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-border text-foreground bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  PRD Seção 9.7 — aceito o relatório de reprogramação, o ajuste fica suspenso até a nova data planejada.
                </p>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Nova data planejada
                  </label>
                  <DatePicker value={repDataPlanejada} onChange={setRepDataPlanejada} />
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
                  rotulo={() => `Referência do relatório (ex.: REP-${item.sigla}-PACIENTE-${repDataPlanejada.replace(/-/g, "").slice(2)})`}
                />
                <button
                  type="button"
                  disabled={salvandoDireto || !repMotivo.trim() || !repDataPlanejada || !evidenciasCompletas(repEvidencias, 1)}
                  onClick={() => executarDireto(() => onSalvarReprogramacaoImpedimento({
                    dataPlanejada: repDataPlanejada,
                    motivo: repMotivo.trim(),
                    evidencias: limparEvidencias(repEvidencias),
                  }))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#222847] dark:bg-slate-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {salvandoDireto ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                  {salvandoDireto ? "Salvando…" : "Aceitar reprogramação"}
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
            await onSalvarEntrega({ status: "entregue", evidencias: limparEvidencias(evidencias), observacao: observacao || null, motivo, dataEntrega: dataEntregaInput })
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
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            const ok = await onExcluirEntrega(motivo)
            if (ok) setConfirmando(null)
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
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            const ok = await onExcluirPlanejamento(motivo)
            if (ok) setConfirmando(null)
          }}
        />
      )}
    </div>
  )
}
