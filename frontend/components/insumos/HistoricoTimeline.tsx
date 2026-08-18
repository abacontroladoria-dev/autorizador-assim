"use client"

import { STATUS_LABEL } from "@/lib/insumos/rotulos"
import type { HistoricoStatusCompra } from "@/services/insumos.service"

// Linha do tempo de status. Porta HistoricoTimeline.tsx do AXIUM.

export function HistoricoTimeline({ historico }: { historico: HistoricoStatusCompra[] }) {
  if (historico.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
  }

  return (
    <ol className="flex flex-col gap-3">
      {historico.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {item.status_anterior ? `${STATUS_LABEL[item.status_anterior]} → ` : ""}
              {STATUS_LABEL[item.status_novo]}
            </span>
            <span className="text-xs text-muted-foreground">
              {item.origem === "SISTEMA" ? "sistema" : "usuário"}
            </span>
          </div>
          {item.observacao && <p className="text-sm text-muted-foreground">{item.observacao}</p>}
          <span className="text-xs tabular-nums text-muted-foreground">
            {new Date(item.criado_em).toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ol>
  )
}
