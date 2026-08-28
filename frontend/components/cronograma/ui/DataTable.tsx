"use client"

import type { CSSProperties, ReactNode } from "react"
import { ChevronDown, ChevronUp, Search, type LucideIcon } from "lucide-react"

interface ListCardProps {
  icon: LucideIcon
  title: string
  count: number
  titleColor?: string
  actions?: ReactNode
  children: ReactNode
}

export function ListCard({ icon: Icon, title, count, titleColor = "var(--foreground)", actions, children }: ListCardProps) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.05)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon size={16} style={{ color: titleColor, flexShrink: 0 }} />
          <span style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)", color: titleColor }}>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", fontWeight: "var(--weight-medium)", whiteSpace: "nowrap" }}>
            {count} {count === 1 ? "registro" : "registros"}
          </span>
          {actions}
        </div>
      </div>
      {children}
    </div>
  )
}

// Busca por paciente — sempre posicionada à direita, mesmo componente nas 4
// sub-abas de Acompanhamento (Aguardando/Confirmados/Recusados/Inviáveis).
export function SearchInput({ value, onChange, placeholder = "Buscar paciente..." }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{ position: "relative" }}>
      <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          padding: "6px 10px 6px 28px", fontSize: "var(--text-sm)", fontFamily: "inherit",
          background: "var(--card)", color: "var(--foreground)", width: "200px",
        }}
      />
    </div>
  )
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div style={{ padding: "44px 24px", textAlign: "center" }}>
      <Icon size={26} strokeWidth={1.5} style={{ color: "var(--muted-foreground)", opacity: 0.5, marginBottom: "10px" }} />
      <div style={{ color: "var(--muted-foreground)", fontSize: "var(--text-md)" }}>{text}</div>
    </div>
  )
}

// ─── Lista em formato de agenda (substitui <table>) ────────────────────────
// Linhas de registro (confirmados/recusados/inviáveis) leem melhor como uma
// lista de itens agrupados por dia do que como uma grade de colunas — cada
// linha vira uma frase (quando → quem → o quê), não uma sequência de células.

export function GroupHeader({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px 6px", width: "100%",
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}
    >
      <span style={{
        fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--muted-foreground)",
        textTransform: "uppercase", letterSpacing: ".05em",
        // minWidth:0 é o que permite o ellipsis funcionar dentro de um flex item —
        // sem ele, nomes de paciente longos (diferente dos rótulos curtos de dia
        // da semana que este componente agrupava antes) estouram a largura da linha.
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1,
      }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>· {count}</span>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      {open
        ? <ChevronUp size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        : <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />}
    </button>
  )
}

export function TimeBadge({ hora, color }: { hora: string; color?: string }) {
  return (
    <div style={{
      flexShrink: 0, width: "56px", textAlign: "center", borderRadius: "var(--radius-md)", padding: "7px 4px",
      background: color ? `${color}18` : "var(--muted)",
      border: color ? `1px solid ${color}33` : "1px solid transparent",
    }}>
      <div style={{ fontFamily: "monospace", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-sm)", color: color ?? "var(--foreground)" }}>{hora}</div>
    </div>
  )
}

// ─── Painel de detalhe expansível (seta ▾ por linha) ───────────────────────
// Mesmo padrão de CampoDetalhe já usado em ModalRemuneracaoRP.tsx e
// ModalAnaliseTerapeuta.tsx (rótulo/valor em grid) — esta é a 3ª tela a
// precisar dele, então passa a viver aqui em vez de copiado de novo.

export function CampoDetalhe({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)" }}>
        {rotulo}
      </div>
      <div style={{ marginTop: "2px", fontSize: "var(--text-xs)", color: "var(--foreground)", wordBreak: "break-word" }}>
        {valor}
      </div>
    </div>
  )
}

export function DetalheGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px 16px",
      padding: "12px 18px", background: "var(--muted)", borderTop: "1px solid var(--border)",
    }}>
      {children}
    </div>
  )
}

export function ExpandToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label ?? (open ? "Ocultar detalhes" : "Ver detalhes")}
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        width: "28px", height: "28px", borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)",
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }} />
    </button>
  )
}

export const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "14px",
  padding: "12px 18px",
  borderTop: "1px solid var(--border)",
}

export const rowClass = "acomp-tr"
