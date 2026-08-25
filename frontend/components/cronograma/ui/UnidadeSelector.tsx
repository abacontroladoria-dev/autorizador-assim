"use client"

import { B } from "@/lib/cronograma/constants"
import { UNIDADES_DISPONIVEIS } from "@/lib/admin/unidades"
import { AREA_LABEL_STYLE, toggleButtonStyle } from "./ocupStyles"

interface Props {
  /** Unidades selecionadas. Sempre 1 só quando `multiplas` é false. */
  value: string[]
  onChange: (unidades: string[]) => void
  /** "Permite dias em unidades distintas?" — controla único-select × checkboxes. */
  multiplas: boolean
  onMultiplasChange: (multiplas: boolean) => void
}

// Seletor de unidade(s) usado pelas modalidades "Criar Novo Cronograma" e
// "Orçamento" (Ocupação de Paciente). Sem o toggle, o usuário só pode escolher 1
// unidade; com o toggle ligado, vira um grupo de checkboxes independentes — o
// cronograma gerado pode então misturar dias em unidades diferentes. Os botões
// seguem o mesmo padrão dos filtros do Modo 1 (navy translúcido quando ativos).
export function UnidadeSelector({ value, onChange, multiplas, onMultiplasChange }: Props) {
  function handleToggleMultiplas(next: boolean) {
    onMultiplasChange(next)
    // Desligar com mais de uma marcada não teria como decidir qual manter —
    // limpa a seleção pra forçar escolha explícita em vez de um corte arbitrário.
    if (!next && value.length > 1) onChange([])
  }

  function handleClique(u: string) {
    if (!multiplas) { onChange([u]); return }
    onChange(value.includes(u) ? value.filter(x => x !== u) : [...value, u])
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} role="group" aria-label="Unidade">
        {UNIDADES_DISPONIVEIS.map(u => {
          const active = value.includes(u)
          return (
            <button
              key={u}
              type="button"
              aria-pressed={active}
              onClick={() => handleClique(u)}
              className="crono-wb-toggle"
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                padding: "6px 8px", borderRadius: "8px", fontSize: "11px",
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                ...toggleButtonStyle(active),
              }}
            >
              {multiplas && (
                <span
                  aria-hidden="true"
                  style={{
                    width: "12px", height: "12px", borderRadius: "3px", flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    border: `1.5px solid ${active ? B.navy : "var(--muted-foreground)"}`,
                    background: active ? B.navy : "transparent",
                    color: "white", fontSize: "9px", lineHeight: 1,
                  }}
                >
                  {active ? "✓" : ""}
                </span>
              )}
              {u}
            </button>
          )
        })}
      </div>

      <label
        className="flex items-center gap-1.5 cursor-pointer select-none"
        style={{ ...AREA_LABEL_STYLE, fontWeight: 500 }}
      >
        <input
          type="checkbox"
          checked={multiplas}
          onChange={e => handleToggleMultiplas(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-input"
        />
        Permite dias em unidades distintas?
      </label>
    </div>
  )
}
