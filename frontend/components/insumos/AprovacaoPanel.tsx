"use client"

import { useState, type FormEvent } from "react"
import { TriangleAlert } from "lucide-react"
import type { Tone } from "@/hooks/useToneColor"
import { Button } from "@/components/ui/button"
import { StatusChip } from "@/components/ui/tones"
import { CampoSelecao, CampoTextoLongo } from "@/components/insumos/campos"
import { fmt } from "@/lib/remuneracao/formatacao"
import { DECISOES_APROVACAO, type DecisaoAprovacaoCompra } from "@/lib/insumos/tipos"
import type { CotacaoCompra } from "@/services/insumos.service"

// Decisão de aprovação (aprovar/reprovar/pedir nova cotação). Porta
// AprovacaoPanel.tsx do AXIUM — mesmas duas regras do servidor
// (validarDecisaoAprovacao em lib/insumos/status-solicitacao.ts) checadas aqui
// primeiro, para dar erro sem round-trip.

const DECISAO_LABEL: Record<DecisaoAprovacaoCompra, string> = {
  APROVAR: "Aprovar",
  SOLICITAR_NOVA_COTACAO: "Solicitar nova cotação",
  REPROVAR: "Reprovar",
}

// Mesmo tom de TONE_POR_STATUS (lib/insumos/rotulos.ts): aprovar leva ao mesmo
// verde de APROVADA, reprovar ao mesmo vermelho de REPROVADA, nova cotação ao
// azul de "andando por conta do sistema". Aprovar e reprovar têm consequência
// oposta e, antes desta cor, o botão de confirmar era idêntico para os dois —
// só o texto do rótulo diferia.
const DECISAO_TONE: Record<DecisaoAprovacaoCompra, Tone> = {
  APROVAR: "green",
  SOLICITAR_NOVA_COTACAO: "blue",
  REPROVAR: "red",
}

const DECISAO_BOTAO_CLASSE: Record<DecisaoAprovacaoCompra, string> = {
  APROVAR: "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500",
  SOLICITAR_NOVA_COTACAO: "bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500",
  REPROVAR: "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600",
}

export type DecisaoAprovacaoValues = {
  decisao: DecisaoAprovacaoCompra
  cotacaoEscolhidaId?: string
  justificativa?: string
}

export function AprovacaoPanel({
  cotacoes,
  onSubmit,
}: {
  cotacoes: CotacaoCompra[]
  onSubmit: (input: DecisaoAprovacaoValues) => Promise<void>
}) {
  const [decisao, setDecisao] = useState<DecisaoAprovacaoCompra>("APROVAR")
  const [cotacaoEscolhidaId, setCotacaoEscolhidaId] = useState(cotacoes[0]?.id ?? "")
  const [justificativa, setJustificativa] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    if (decisao === "APROVAR" && !cotacaoEscolhidaId) {
      setErro("Selecione uma cotação para aprovar.")
      return
    }
    if (decisao === "REPROVAR" && !justificativa.trim()) {
      setErro("Justificativa é obrigatória para reprovar.")
      return
    }
    setEnviando(true)
    try {
      await onSubmit({
        decisao,
        cotacaoEscolhidaId: decisao === "APROVAR" ? cotacaoEscolhidaId : undefined,
        justificativa: justificativa.trim() || undefined,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a decisão. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <CampoSelecao
        label="Decisão"
        valor={decisao}
        onChange={(v) => setDecisao(v as DecisaoAprovacaoCompra)}
        obrigatorio
        ajuda={
          <span className="inline-flex items-center gap-1.5">
            Status após confirmar: <StatusChip tone={DECISAO_TONE[decisao]}>{DECISAO_LABEL[decisao]}</StatusChip>
          </span>
        }
      >
        {DECISOES_APROVACAO.map((valor) => (
          <option key={valor} value={valor}>
            {DECISAO_LABEL[valor]}
          </option>
        ))}
      </CampoSelecao>

      {decisao === "APROVAR" && (
        <CampoSelecao label="Cotação escolhida" valor={cotacaoEscolhidaId} onChange={setCotacaoEscolhidaId} obrigatorio>
          {cotacoes.map((cotacao) => (
            <option key={cotacao.id} value={cotacao.id}>
              {cotacao.fornecedor} — {fmt(Number(cotacao.valor_decisao))}
            </option>
          ))}
        </CampoSelecao>
      )}

      <CampoTextoLongo
        label={decisao === "REPROVAR" ? "Justificativa (obrigatória)" : "Justificativa"}
        valor={justificativa}
        onChange={setJustificativa}
        obrigatorio={decisao === "REPROVAR"}
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando} className={DECISAO_BOTAO_CLASSE[decisao]}>
          {enviando ? "Enviando…" : `Confirmar: ${DECISAO_LABEL[decisao]}`}
        </Button>
      </div>
    </form>
  )
}
