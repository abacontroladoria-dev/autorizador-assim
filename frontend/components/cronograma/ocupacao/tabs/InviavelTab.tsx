"use client"

import { useMemo, useState } from "react"
import { Ban, Inbox, RotateCcw, Search } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { ListCard, EmptyState, SearchInput, rowStyle, rowClass } from "@/components/cronograma/ui/DataTable"
import type { InvItem, RecItem, WaMap } from "@/types/cronograma"

interface Props {
  inv: InvItem[]
  rec: RecItem[]
  waMap: WaMap
  onRemove: (i: number) => void
}

export function InviavelTab({ inv, onRemove }: Props) {
  const [removIdx, setRemovIdx] = useState<number | null>(null)
  const [filtro, setFiltro] = useState("")

  const filtrados = useMemo(() => {
    const withIdx = inv.map((iv, i) => ({ iv, i }))
    const q = filtro.trim().toLowerCase()
    return q ? withIdx.filter(({ iv }) => iv.paciente.toLowerCase().includes(q)) : withIdx
  }, [inv, filtro])

  return (
    <>
    <ListCard
      icon={Ban}
      title="Inviáveis"
      count={inv.length}
      titleColor="#b45309"
      actions={<SearchInput value={filtro} onChange={setFiltro} />}
    >
      {!inv.length ? (
        <EmptyState icon={Inbox} text="Nenhum inviável registrado" />
      ) : !filtrados.length ? (
        <EmptyState icon={Search} text={`Nenhum resultado para "${filtro}"`} />
      ) : (
        <div>
          {filtrados.map(({ iv, i }) => (
            <div key={i} className={rowClass} style={rowStyle}>
              <div style={{ flexShrink: 0, width: "56px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--muted)", borderRadius: "var(--radius-md)" }}>
                <Ban size={16} style={{ color: "#b45309" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: "var(--weight-heavy)", fontSize: "var(--text-base)", color: "var(--foreground)" }}>{iv.paciente}</span>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--muted-foreground)", fontStyle: "italic", marginTop: "2px" }}>{iv.motivo}</div>
                {(iv.dia || iv.hora) && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", marginTop: "4px" }}>{iv.dia} {iv.hora}</div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{iv.registradoEm}</span>
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
      )}
    </ListCard>
    {removIdx !== null && (
      <ConfirmDialog
        title="Reativar esta sugestão?"
        description="Ela sai da lista de inviáveis e volta a ser oferecida normalmente para este paciente."
        confirmLabel="Reativar"
        confirmColor={B.blue}
        onConfirm={() => { onRemove(removIdx); setRemovIdx(null) }}
        onCancel={() => setRemovIdx(null)}
      />
    )}
    </>
  )
}
