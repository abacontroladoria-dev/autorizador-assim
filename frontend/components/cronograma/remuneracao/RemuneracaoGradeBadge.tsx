"use client"

// Controles da fonte de dados da Rem. Mês - Total, injetados no header.
//
// Mesma forma do header da Análise de Evolução
// (central-terapeutas/tratativas/TratativasUploadBadge.tsx): UMA linha, um
// seletor de mês e um selo de cobertura. Nada mais.
//
// O que havia antes eram duas linhas e sete controles: setas de mês, "Mês
// atual", dois campos de data soltos, "Atualizar", o selo da grade, o aviso de
// execução e o botão CSV. Cada um resolvia um caso real, mas juntos o cabeçalho
// virava um formulário — e o caso real de todos eles é "ver outro mês".
//
// Três decisões herdadas da tela de referência:
//
//  • O mês é escolhido numa lista e carrega ao ser escolhido. Não existe mais um
//    botão "Carregar" separado: escolher já é pedir.
//  • O banco é o caminho normal, e o cabeçalho fica quieto quando ele funciona.
//    O CSV só aparece quando o mês realmente não tem grade no banco — antes de
//    01/07/2026, quando a captura de execução começou, ou num dia em que o sync
//    falhou. Os meses nessa situação já vêm marcados "CSV" na própria lista,
//    para a ausência não ser surpresa depois de selecionar.
//  • "N sem execução" não é mais uma pastilha à parte: vira o anel do selo (que
//    fica âmbar quando há pendência) e o texto completo no title. Eram dois
//    avisos sobre a mesma leitura.

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Loader2, RefreshCw, X,
} from "lucide-react"

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { parseGradeCsv } from "@/lib/remuneracao/uploadParsers"
import { temExecucaoRegistrada } from "@/lib/remuneracao/gradeRemuneracao"
import { periodoDoMes, type PeriodoRP, type ControlesGradeRP } from "@/hooks/useRemuneracao"
import { GradeIncompletaModal } from "./GradeIncompletaModal"

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/** "Julho de 2026". Exportada para o corpo da aba dizer o que está carregando. */
export function labelMes(p: PeriodoRP): string {
  const [ano, mes] = p.de.split("-").map(Number)
  return `${MESES_PT[mes - 1]} de ${ano}`
}

// Mês atual + 12 anteriores — alcança qualquer fechamento com sentido prático.
function ultimosMeses(hoje: Date): PeriodoRP[] {
  const lista: PeriodoRP[] = []
  for (let i = 0; i < 13; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    lista.push(periodoDoMes(ref.getFullYear(), ref.getMonth() + 1))
  }
  return lista
}

/**
 * Selo de cobertura: o anel comunica "quão completa está a leitura" de relance,
 * e fica âmbar quando há sessão agendada sem execução registrada — sem competir
 * em texto com o número de linhas ao lado.
 */
function AnelCobertura({ pct, alerta }: { pct: number; alerta: boolean }) {
  const r = 6
  const c = 2 * Math.PI * r
  const preenchido = Math.max(0, Math.min(1, pct)) * c
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16"
      className={alerta ? "text-amber-500" : "text-emerald-500"}
      aria-hidden focusable="false"
    >
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <circle
        cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${preenchido} ${c - preenchido}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}

interface Props {
  c: ControlesGradeRP
}

// Recebe por prop, não por contexto: o header renderiza este componente fora do
// RemuneracaoRPProvider. Ver o comentário de `controlesGrade` em useRemuneracao.ts.
export function RemuneracaoGradeBadge({ c }: Props) {
  const {
    evoRows, csvName, carregarGrade, limparGrade,
    fonteGrade, periodo, periodoCarregado, coberturaGrade,
    carregarGradeDoBanco, carregarGradeAuto, gradeLoading,
    gradeErro, gradeErroResumo, gradeErroDica, gradeErroQtd, gradeAviso,
  } = c

  const gradeInputRef = useRef<HTMLInputElement>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadErro, setUploadErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  // Primeira carga automática. Fica aqui, e não no provider, porque o provider
  // vive no layout do segmento e este componente só monta na aba que usa a grade.
  useEffect(() => { carregarGradeAuto() }, [carregarGradeAuto])

  const meses = useMemo(() => ultimosMeses(new Date()), [])
  const gradeLoaded = evoRows.length > 0
  const reprovada = !!gradeErroResumo
  const ocupado = gradeLoading || uploadLoading

  // Medido em julho/2026: 14.788 linhas lidas → bem menos sessões remuneráveis.
  // Sem dizer de onde vem a diferença, os dois números parecem se contradizer.
  const tituloGrade = [
    `${evoRows.length.toLocaleString("pt-BR")} linhas lidas da grade do período.`,
    periodoCarregado ? `Período carregado: ${periodoCarregado.de.split("-").reverse().join("/")} a ${periodoCarregado.ate.split("-").reverse().join("/")}.` : null,
    "O cálculo considera menos: ficam fora os horários fictícios e as sessões que não geram"
      + " pagamento. A composição de cada profissional está no detalhamento dele.",
    coberturaGrade && coberturaGrade.semExecucao > 0
      ? (gradeAviso ?? `${coberturaGrade.semExecucao.toLocaleString("pt-BR")} sessões agendadas ainda sem execução registrada. Entram no cálculo como não evoluídas.`)
      : null,
  ].filter(Boolean).join("\n\n")

  async function onGradeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploadLoading(true)
    setUploadErro(null)
    try {
      const rows = await parseGradeCsv(file)
      // Aguardado: carregarGrade lê a presença do período do arquivo antes de
      // publicar as linhas, e é esse trecho que o "Lendo..." precisa cobrir.
      await carregarGrade(rows, file.name)
    } catch (err) {
      setUploadErro(err instanceof Error ? err.message : "Falha ao ler o arquivo.")
    } finally {
      setUploadLoading(false)
    }
  }

  // Abre sozinho quando uma carga TERMINA reprovada — é a hora em que a pessoa
  // está olhando e ainda não sabe por que a tela está vazia. A chave inclui o
  // período para que trocar de mês e reprovar de novo reabra; sem ela, fechar
  // uma vez silenciaria todos os meses seguintes.
  const chaveReprovacao = gradeErroResumo ? `${gradeErroResumo}|${periodo.de}|${periodo.ate}` : null
  const ultimaReprovacaoVista = useRef<string | null>(null)
  useEffect(() => {
    if (chaveReprovacao && chaveReprovacao !== ultimaReprovacaoVista.current) {
      ultimaReprovacaoVista.current = chaveReprovacao
      setModalAberto(true)
    }
    if (!chaveReprovacao) ultimaReprovacaoVista.current = null
  }, [chaveReprovacao])

  return (
    <div className="flex items-center gap-2">
      <input ref={gradeInputRef} type="file" accept=".csv" className="hidden" onChange={onGradeChange} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60 sm:min-h-0"
          >
            <CalendarClock size={12} className="text-muted-foreground" />
            {labelMes(periodo)}
            <ChevronDown size={12} className="text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          {meses.map(p => {
            const disponivel = temExecucaoRegistrada(p.de)
            const ativo = p.de === periodo.de
            return (
              <DropdownMenuItem
                key={p.de}
                onSelect={() => void carregarGradeDoBanco(p)}
                className={ativo ? "bg-muted font-semibold text-foreground" : ""}
              >
                <span className="flex-1">{labelMes(p)}</span>
                {!disponivel && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    CSV
                  </span>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {gradeLoaded ? (
        <div className="flex items-center gap-1">
          <span
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
            title={tituloGrade}
          >
            {coberturaGrade
              ? <AnelCobertura pct={coberturaGrade.cobertura} alerta={coberturaGrade.semExecucao > 0} />
              : <CheckCircle2 size={11} className="text-green-500" />}
            {/* "linhas da grade", e não "registros": este número é tudo que foi
                LIDO do banco (toda a agenda da unidade no mês), e não o que vira
                pagamento. Chamar de "registros" convidava a comparação com os
                números do painel e a diferença parecia erro. Ver o title. */}
            {evoRows.length.toLocaleString("pt-BR")} linhas da grade
            {fonteGrade === "upload" && csvName && <span className="text-muted-foreground">· {csvName}</span>}
            {fonteGrade === "upload" && (
              <button onClick={limparGrade} className="ml-0.5 text-muted-foreground/60 transition-colors hover:text-destructive" title="Remover CSV">
                <X size={11} />
              </button>
            )}
          </span>
          {fonteGrade === "banco" && (
            <button
              type="button"
              onClick={() => !ocupado && carregarGradeDoBanco()}
              disabled={ocupado}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              title="Atualizar"
            >
              {gradeLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </button>
          )}
        </div>
      ) : reprovada ? (
        // Alça para reabrir o modal, que é onde moram a explicação, o "Tentar de
        // novo" e o "Carregar CSV". O cabeçalho nunca carrega a explicação: ela
        // não cabe em uma linha, e foi assim que este bloco passou por cima dos
        // controles.
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <AlertTriangle size={11} aria-hidden />
          {gradeErroResumo}
          {gradeErroQtd !== undefined && (
            <span className="font-semibold tabular-nums">· {gradeErroQtd.toLocaleString("pt-BR")}</span>
          )}
        </button>
      ) : gradeLoading || uploadLoading ? (
        <Loader2 size={13} className="animate-spin text-muted-foreground" />
      ) : null}

      {uploadErro && (
        <span
          className="flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-[11px] font-medium text-destructive"
          title={uploadErro}
        >
          <AlertTriangle size={10} />
          Falha no upload
        </span>
      )}

      <GradeIncompletaModal
        aberto={modalAberto}
        onOpenChange={setModalAberto}
        resumo={gradeErroResumo ?? ""}
        erro={gradeErro ?? ""}
        dica={gradeErroDica ?? ""}
        quantidade={gradeErroQtd}
        periodo={periodo}
        carregando={gradeLoading}
        onRecarregar={() => { void carregarGradeDoBanco() }}
        onUsarCsv={() => { setModalAberto(false); gradeInputRef.current?.click() }}
      />
    </div>
  )
}
