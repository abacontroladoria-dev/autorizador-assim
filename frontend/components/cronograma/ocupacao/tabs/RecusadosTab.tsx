"use client"

import { useMemo, useState } from "react"
import { Inbox, MessageSquare, RotateCcw, Search, XCircle } from "lucide-react"
import { B, DIAS_ORD } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { ListCard, EmptyState, GroupHeader, TimeBadge, SearchInput, rowStyle, rowClass } from "@/components/cronograma/ui/DataTable"
import type { InvItem, RecItem, WaMap } from "@/types/cronograma"

interface Props {
  rec: RecItem[]
  inv: InvItem[]
  waMap: WaMap
  onRemove: (i: number) => void
}

export function RecusadosTab({ rec, onRemove }: Props) {
  const [removIdx, setRemovIdx] = useState<number | null>(null)
  const [filtro, setFiltro] = useState("")
  const [diasFechados, setDiasFechados] = useState<Set<string>>(new Set())
  const toggleDia = (dia: string) => setDiasFechados(prev => {
    const next = new Set(prev)
    if (next.has(dia)) next.delete(dia)
    else next.add(dia)
    return next
  })

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return q ? rec.filter(r => r.paciente.toLowerCase().includes(q)) : rec
  }, [rec, filtro])

  // Índice original preservado em cada item para que "reativar" continue
  // apontando para a posição certa em `rec` mesmo depois de agrupar/ordenar.
  const groups = useMemo(() => {
    const withIdx = filtrados.map(r => ({ r, i: rec.indexOf(r) }))
    const map = new Map<string, { r: RecItem; i: number }[]>()
    for (const item of withIdx) {
      const arr = map.get(item.r.dia) ?? []
      arr.push(item)
      map.set(item.r.dia, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (DIAS_ORD[a] ?? 99) - (DIAS_ORD[b] ?? 99))
      .map(([dia, items]) => [dia, items.slice().sort((a, b) => a.r.hora.localeCompare(b.r.hora))] as const)
  }, [filtrados, rec])

  return (
    <>
    <ListCard
      icon={XCircle}
      title="Recusados pela Família"
      count={rec.length}
      titleColor="#dc2626"
      actions={<SearchInput value={filtro} onChange={setFiltro} />}
    >
      {!rec.length ? (
        <EmptyState icon={Inbox} text="Nenhuma recusa registrada" />
      ) : !filtrados.length ? (
        <EmptyState icon={Search} text={`Nenhum resultado para "${filtro}"`} />
      ) : (
        <div>
          {groups.map(([dia, items]) => (
            <div key={dia}>
              <GroupHeader label={dia} count={items.length} open={!diasFechados.has(dia)} onToggle={() => toggleDia(dia)} />
              {!diasFechados.has(dia) && items.map(({ r, i }) => (
                <div key={i} className={rowClass} style={rowStyle}>
                  <TimeBadge hora={r.hora} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: "var(--weight-heavy)", fontSize: "var(--text-base)", color: "var(--foreground)" }}>{r.paciente}</span>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--muted-foreground)", marginTop: "2px" }}>
                      {r.especialidade || "—"} · {fmtName(r.profissional)}{r.unidade ? ` · ${r.unidade}` : ""}
                    </div>
                    {r.obs && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "5px", fontSize: "var(--text-xs)", color: "var(--muted-foreground)", marginTop: "4px" }}>
                        <MessageSquare size={11} style={{ flexShrink: 0, marginTop: "1px" }} />
                        <span style={{ whiteSpace: "pre-wrap" }}>{r.obs}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{r.registradoEm}</span>
                    <button onClick={() => setRemovIdx(i)} style={{
                      display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap",
                      fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)",
                      color: B.blue, background: "var(--cron-active-bg)", border: `1px solid ${B.blue}44`,
                      borderRadius: "var(--radius-sm)", padding: "5px 10px", cursor: "pointer", fontFamily: "inherit",
                    }}>
                      <RotateCcw size={11} /> Reativar sugestão
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </ListCard>
    {removIdx !== null && (
      <ConfirmDialog
        title="Reativar esta sugestão?"
        description="Ela sai da lista de recusados e volta a ser oferecida normalmente para este paciente."
        confirmLabel="Reativar"
        confirmColor={B.blue}
        onConfirm={() => { onRemove(removIdx); setRemovIdx(null) }}
        onCancel={() => setRemovIdx(null)}
      />
    )}
    </>
  )
}
