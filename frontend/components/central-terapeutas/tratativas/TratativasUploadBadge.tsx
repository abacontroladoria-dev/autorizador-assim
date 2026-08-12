"use client"

// Controles da fonte de dados da Análise de Tratativas, injetados no header.
//
// Desenho: o banco é o caminho normal e o header reflete isso ficando quieto —
// mês + um selo de cobertura, nada mais. O CSV só aparece quando o mês
// selecionado realmente não tem grade no banco (antes de 01/07/2026, quando a
// captura de execução começou, ou num dia em que a sincronização falhou); nos
// demais meses o botão de upload nem é renderizado. Ver useTratativas.ts —
// MotivoSemGrade distingue os dois casos ("piso" vs "falha") para o modal
// abaixo escolher o tom certo: um é esperado, o outro é uma anomalia.

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2, Upload, Loader2, X, RefreshCw, AlertTriangle, ChevronDown, CalendarClock, Info,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { parseGradeCsv } from "@/lib/remuneracao/uploadParsers"
import { temExecucaoRegistrada } from "@/lib/remuneracao/gradeRemuneracao"
import { periodoDoMes, type PeriodoRP } from "@/hooks/useRemuneracao"
import type { ControlesGradeTratativas } from "@/hooks/useTratativas"

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function labelMes(p: PeriodoRP): string {
  const [ano, mes] = p.de.split("-").map(Number)
  return `${MESES_PT[mes - 1]} de ${ano}`
}

// Mês atual + 12 anteriores — alcança qualquer auditoria com sentido prático.
// Os meses antes do piso de execução vêm marcados "CSV" no próprio menu, para
// a ausência de dado no banco não ser uma surpresa só depois de selecionar.
function ultimosMeses(hoje: Date): PeriodoRP[] {
  const lista: PeriodoRP[] = []
  for (let i = 0; i < 13; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    lista.push(periodoDoMes(ref.getFullYear(), ref.getMonth() + 1))
  }
  return lista
}

/**
 * Selo de cobertura: substitui o check genérico quando há um percentual real
 * por trás dele. O anel comunica "quão completo" de relance — a pergunta que
 * esta tela inteira existe para responder — sem competir em texto com o
 * número de registros ao lado.
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
  c: ControlesGradeTratativas
}

export function TratativasUploadBadge({ c }: Props) {
  const {
    evoRows, csvName, carregarGrade, limparGrade,
    fonteGrade, periodo, coberturaGrade,
    carregarGradeDoBanco, carregarGradeAuto, gradeLoading,
    gradeErro, gradeErroResumo, gradeErroDica, gradeErroQtd, gradeErroTipo, gradeAviso,
  } = c

  const gradeInputRef = useRef<HTMLInputElement>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadErro, setUploadErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  // Primeira carga automática, ao montar a aba.
  useEffect(() => { carregarGradeAuto() }, [carregarGradeAuto])

  const meses = useMemo(() => ultimosMeses(new Date()), [])
  const gradeLoaded = evoRows.length > 0
  const semGradeNoBanco = gradeErroTipo !== null
  const ocupado = gradeLoading || uploadLoading

  async function onGradeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploadLoading(true)
    setUploadErro(null)
    try {
      const rows = await parseGradeCsv(file)
      carregarGrade(rows, file.name)
    } catch (err) {
      setUploadErro(err instanceof Error ? err.message : "Falha ao ler o arquivo.")
    } finally {
      setUploadLoading(false)
    }
  }

  // Abre o modal sozinho na primeira vez que um mês sem grade no banco é
  // selecionado. A chave inclui o motivo e o período: trocar de mês (ou virar
  // de "piso" para "falha") reabre; insistir no mesmo mês depois de fechar, não.
  const chaveSemDados = semGradeNoBanco ? `${gradeErroTipo}|${periodo.de}` : null
  const ultimaVista = useRef<string | null>(null)
  useEffect(() => {
    if (chaveSemDados && chaveSemDados !== ultimaVista.current) {
      ultimaVista.current = chaveSemDados
      setModalAberto(true)
    }
    if (!chaveSemDados) ultimaVista.current = null
  }, [chaveSemDados])

  // Fecha sozinho se o motivo desaparecer enquanto o modal está aberto — ex.:
  // "Tentar de novo" deu certo, ou o mês mudou por fora. Sem isto o modal
  // ficava aberto mostrando o texto de erro em branco após um retry bem-sucedido.
  useEffect(() => {
    if (!semGradeNoBanco) setModalAberto(false)
  }, [semGradeNoBanco])

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

      {semGradeNoBanco ? (
        <button
          type="button"
          onClick={() => !ocupado && gradeInputRef.current?.click()}
          disabled={ocupado}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-[#2A92C0]/60 bg-[#2A92C0]/5 px-3 py-1 text-xs font-medium text-[#2A92C0] transition-all hover:bg-[#2A92C0]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploadLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
          {uploadLoading ? "Lendo..." : "Carregar CSV"}
        </button>
      ) : gradeLoaded ? (
        <div className="flex items-center gap-1">
          <span
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
            title={
              coberturaGrade && coberturaGrade.semExecucao > 0
                ? (gradeAviso ?? `${coberturaGrade.semExecucao.toLocaleString("pt-BR")} sessões agendadas ainda sem execução registrada.`)
                : undefined
            }
          >
            {coberturaGrade
              ? <AnelCobertura pct={coberturaGrade.cobertura} alerta={coberturaGrade.semExecucao > 0} />
              : <CheckCircle2 size={11} className="text-green-500" />}
            {evoRows.length.toLocaleString("pt-BR")} registros
            {fonteGrade === "upload" && csvName && <span className="text-muted-foreground">· {csvName}</span>}
            {fonteGrade === "upload" && (
              <button onClick={limparGrade} className="ml-0.5 text-muted-foreground/60 hover:text-destructive transition-colors" title="Remover CSV">
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
      ) : gradeLoading ? (
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

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${gradeErroTipo === "falha" ? "text-destructive" : "text-foreground"}`}>
              {gradeErroTipo === "falha"
                ? <AlertTriangle size={15} aria-hidden />
                : <Info size={15} className="text-[#2A92C0]" aria-hidden />}
              {gradeErroResumo}
            </DialogTitle>
          </DialogHeader>

          {/* O número carrega o peso; a frase explica — mesmo padrão do modal
              equivalente do /rp (GradeIncompletaModal). "piso" nunca tem
              quantidade (não há o que contar: o dado simplesmente não existe),
              então essa linha só aparece no caso "falha". */}
          <div className="flex items-start gap-4">
            {gradeErroQtd !== undefined && (
              <span className="font-heading text-4xl leading-none font-semibold tabular-nums text-destructive">
                {gradeErroQtd.toLocaleString("pt-BR")}
              </span>
            )}
            <DialogDescription className="pt-0.5">{gradeErro}</DialogDescription>
          </div>

          <p className="text-xs text-muted-foreground">
            {/* "piso" já cita o mês na própria dica (ver checarPisoDeExecucao);
                só "falha" precisa do período à parte, porque o texto dela não
                menciona nenhum mês. */}
            {gradeErroTipo === "falha" && (
              <span className="font-medium text-foreground">{labelMes(periodo)}. </span>
            )}
            {gradeErroDica}
          </p>

          <DialogFooter>
            {/* "Tentar de novo" só faz sentido quando a causa é uma falha de
                captura — retry num mês antes do piso nunca resolve nada, e
                oferecer o botão ali seria prometer algo que não acontece. */}
            {gradeErroTipo === "falha" && (
              <button
                type="button"
                onClick={() => void carregarGradeDoBanco()}
                disabled={gradeLoading}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gradeLoading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
                {gradeLoading ? "Lendo..." : "Tentar de novo"}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setModalAberto(false); gradeInputRef.current?.click() }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2A92C0] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2A92C0]/90"
            >
              <Upload size={12} aria-hidden />
              Carregar CSV
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
