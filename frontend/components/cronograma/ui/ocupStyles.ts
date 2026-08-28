import type { CSSProperties } from "react"
import { B } from "@/lib/cronograma/constants"

// Tokens de estilo copiados literalmente de OcupPacMode.tsx ("Aumentar
// Cronograma") — fonte da verdade visual da tela de Ocupação de Paciente.
// Existem aqui pra que "Criar Novo Cronograma" e "Orçamento" fiquem
// rigorosamente idênticos ao Modo 1 sem duplicar os mesmos objetos de estilo
// em dois arquivos. OcupPacMode.tsx em si NUNCA importa daqui — ele continua
// com seus próprios literais, intocado; isto é só para os dois modos novos.

/** Label de área/seção — mesmo padrão de "Paciente"/"Seleção"/"Filtros" na workbench bar. */
export const AREA_LABEL_STYLE: CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "var(--muted-foreground)",
  letterSpacing: "0.02em",
}

/** Card de conteúdo (seções, painéis) — raio 14px, mesmo par border/background do Modo 1. */
export const cardContentStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  borderRadius: "14px",
}

/** Input de texto/select — mesmo raio, padding e anel de foco manual do campo de busca do Modo 1. */
export function inputStyle(focado: boolean): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--border)",
    borderRadius: "9px",
    padding: "7px 12px",
    fontSize: "16px",
    fontFamily: "inherit",
    outline: "none",
    background: "var(--card)",
    color: "inherit",
    boxShadow: focado ? `0 0 0 2px ${B.navy}` : "none",
  }
}

/** Botão de toggle/filtro (turno, unidade) — fundo translúcido navy quando ativo, igual aos filtros da workbench bar. */
export function toggleButtonStyle(ativo: boolean): CSSProperties {
  return {
    border: `1px solid ${ativo ? B.navy : "var(--border)"}`,
    background: ativo ? `${B.navy}15` : "var(--muted)",
    color: ativo ? B.navy : "var(--card-foreground)",
    fontWeight: ativo ? 700 : 500,
  }
}

/** CTA primária (ação afirmativa do passo) — mesmo verde/sombra de "Aceitar alterações" / "Confirmar implantação". */
export function ctaPrimariaStyle(desabilitado: boolean): CSSProperties {
  return {
    border: "none",
    background: desabilitado ? "#e5e7eb" : "#16a34a",
    color: desabilitado ? "#9ca3af" : "white",
    fontWeight: 800,
    boxShadow: desabilitado ? "none" : "0 2px 8px rgba(22,163,74,0.30)",
    cursor: desabilitado ? "not-allowed" : "pointer",
  }
}

export type BadgeTom = "sucesso" | "alerta" | "erro" | "neutro"

/** Trincas de cor exatas dos badges/pills do Modo 1 (ocup-badge-pop). */
export function badgeTriad(tom: BadgeTom): CSSProperties {
  const TRIADES: Record<BadgeTom, CSSProperties> = {
    sucesso: { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" },
    alerta: { background: "#fef3c7", color: "#d97706", border: "1px solid #fcd34d" },
    erro: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5" },
    neutro: { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" },
  }
  return TRIADES[tom]
}

export const progressBarTrackStyle: CSSProperties = {
  height: "4px",
  background: "var(--muted)",
  borderRadius: "2px",
  overflow: "hidden",
}

/** Preenchimento via scaleX (não width) — animação de layout barata, mesmo padrão do ocup-progress-bar. */
export function progressBarFillStyle(pct: number, cor: string): CSSProperties {
  return {
    height: "100%",
    width: "100%",
    background: cor,
    transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`,
    transformOrigin: "left",
    transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)",
  }
}
