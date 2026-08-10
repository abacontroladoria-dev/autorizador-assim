"use client"

// HistoricoAuditoriaModal — trilha de auditoria da tela de Ocupação de Salas
// (sala/alocação/núcleo/status_label). Mesma ideia da trilha do PEP
// (pepAuditoria.service.ts), só que aqui já ganha uma UI de leitura — o PEP
// tinha a função de leitura pronta mas nunca ganhou tela.

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { TONE_SOLID } from "@/components/cronograma/ui/tones"
import { camposAlterados, camposSnapshot } from "@/lib/cronograma/auditoriaFormat"
import { getTrilhaAuditoriaSala, type CronogramaTrilhaAcao, type CronogramaTrilhaAuditoria, type CronogramaTrilhaTabela } from "@/services/salasAuditoria.service"

interface Props {
  onClose: () => void
}

const ACAO_LABEL: Record<CronogramaTrilhaAcao, string> = { criar: "Criação", editar: "Edição", excluir: "Exclusão" }
const ACAO_TONE: Record<CronogramaTrilhaAcao, keyof typeof TONE_SOLID> = { criar: "green", editar: "blue", excluir: "red" }
const TABELA_LABEL: Record<CronogramaTrilhaTabela, string> = { sala: "Sala", alocacao: "Alocação", nucleo: "Núcleo", status_label: "Status" }

function nomeContextual(item: CronogramaTrilhaAuditoria): string {
  if (item.tabela === "alocacao") {
    const partes = [item.sala_nome, item.profissional_nome, item.terapia_nome].filter(Boolean)
    return partes.length ? partes.join(" · ") : "—"
  }
  return item.sala_nome ?? item.nucleo_nome ?? item.registro_id
}

function formatarDataHora(item: CronogramaTrilhaAuditoria): string {
  // criado_em_brasilia já vem pronto do banco (DD/MM/AAAA HH:MM, horário de
  // Brasília) — toLocaleString é só um fallback pra linhas antigas sem essa coluna.
  return item.criado_em_brasilia ?? new Date(item.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export function HistoricoAuditoriaModal({ onClose }: Props) {
  const [itens, setItens] = useState<CronogramaTrilhaAuditoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  useEffect(() => {
    getTrilhaAuditoriaSala({ limite: 200 })
      .then(({ data, error }) => { if (error) setError("Não foi possível carregar o histórico."); setItens(data) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <ScheduleModal title="Histórico de alterações" subtitle="Criações, edições e exclusões de salas, alocações, núcleos e status — mais recentes primeiro." maxWidth={720} onClose={onClose}>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando histórico...
        </div>
      )}
      {error && <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>}
      {!loading && !error && itens.length === 0 && (
        <div className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</div>
      )}

      <div className="flex flex-col gap-1.5">
        {itens.map(item => {
          const tone = TONE_SOLID[ACAO_TONE[item.acao]]
          const expandido = expandidoId === item.id
          const alteracoes = item.acao === "editar" ? camposAlterados(item) : []
          const snapshot = item.acao !== "editar" ? camposSnapshot(item) : []
          const temDetalhe = alteracoes.length > 0 || snapshot.length > 0 || !!item.motivo
          return (
            <div key={item.id} className="rounded-lg border border-border px-2.5 py-2">
              <button
                type="button"
                onClick={() => temDetalhe && setExpandidoId(expandido ? null : item.id)}
                className={`flex w-full items-center gap-2 text-left ${temDetalhe ? "cursor-pointer" : "cursor-default"}`}
              >
                {temDetalhe ? (expandido ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />) : <span className="w-3.5 shrink-0" />}
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${tone.bg} ${tone.text}`}>{ACAO_LABEL[item.acao]}</span>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{TABELA_LABEL[item.tabela]}</span>
                <span className="flex-1 truncate text-sm font-semibold text-foreground">{nomeContextual(item)}</span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <div>{item.usuario_nome ?? "Usuário desconhecido"}</div>
                  <div>{formatarDataHora(item)}</div>
                </span>
              </button>
              {expandido && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                  {alteracoes.length === 0 && snapshot.length === 0 && (
                    <div className="text-sm text-muted-foreground">Nenhum outro detalhe registrado pra essa alteração.</div>
                  )}
                  {alteracoes.map(c => (
                    <div key={c.label} className="text-sm text-foreground">
                      <span className="font-semibold">{c.label}:</span> {c.antes} <span className="text-muted-foreground">→</span> {c.depois}
                    </div>
                  ))}
                  {snapshot.map(c => (
                    <div key={c.label} className="text-sm text-foreground">
                      <span className="font-semibold">{c.label}:</span> {c.valor}
                    </div>
                  ))}
                  {item.motivo && (
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">Motivo:</span> {item.motivo}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScheduleModal>
  )
}
