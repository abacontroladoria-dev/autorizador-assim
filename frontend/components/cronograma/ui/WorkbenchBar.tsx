"use client"

import type { CSSProperties, ReactNode } from "react"
import { B } from "@/lib/cronograma/constants"
import { AREA_LABEL_STYLE } from "./ocupStyles"

// Barra de trabalho horizontal dividida em áreas — réplica de .ocup-workbench-bar
// do Modo 1 ("Aumentar Cronograma", OcupPacMode.tsx): um único cartão que sangra
// até a borda direita da página (margin-right negativo + raio só à esquerda), com
// as áreas separadas por bordas verticais.
//
// Existe como componente para que "Criar Novo Cronograma" e "Orçamento" tenham a
// MESMA moldura, em vez de cada um recriar a sua e derivarem com o tempo. O Modo 1
// não importa daqui: ele mantém o seu próprio <style> inline, intocado — por isso a
// classe aqui tem nome próprio (crono-workbench-bar), pra não colidir com a dele
// quando as duas convivem na mesma página.

interface BarProps {
  /** grid-template-columns da barra (ex.: "35fr 18fr 32fr 15fr"). */
  colunas: string
  children: ReactNode
}

export function WorkbenchBar({ colunas, children }: BarProps) {
  return (
    <>
      <style>{`
        .crono-workbench-bar {
          display: grid;
          grid-template-columns: ${colunas};
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px 0 0 16px;
          margin-bottom: 16px;
          margin-right: -1.5rem;
          position: relative;
        }
        @media (max-width: 900px) {
          .crono-workbench-bar { grid-template-columns: 1fr 1fr; }
          .crono-workbench-bar > div:nth-child(2) { border-right: none !important; }
        }
        @media (max-width: 560px) {
          .crono-workbench-bar { grid-template-columns: 1fr; }
          .crono-workbench-bar > div { border-right: none !important; border-bottom: 1px solid var(--border); }
          .crono-workbench-bar > div:last-child { border-bottom: none !important; }
        }
        @media (pointer: coarse) {
          .crono-wb-toggle { min-height: 44px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .crono-workbench-bar * { transition: none !important; }
        }
      `}</style>
      <div className="crono-workbench-bar">{children}</div>
    </>
  )
}

interface AreaProps {
  /** Rótulo da área ("Paciente", "Turno", …) — omitido na área de ação, que traz o seu próprio. */
  label?: string
  /** false só na última área da barra (não há borda depois dela). */
  comBorda?: boolean
  /** "acao" replica a Área 5 do Modo 1: conteúdo alinhado à direita e padding menor. */
  variante?: "campo" | "acao"
  /** Centraliza o conteúdo, como a área "Seleção" do Modo 1. */
  centralizado?: boolean
  children: ReactNode
}

export function WorkbenchArea({
  label, comBorda = true, variante = "campo", centralizado = false, children,
}: AreaProps) {
  const estilo: CSSProperties = variante === "acao"
    ? {
        padding: "10px 14px",
        display: "flex", flexDirection: "column",
        alignItems: "flex-end", textAlign: "right", gap: "8px",
      }
    : {
        padding: "14px 18px",
        display: "flex", flexDirection: "column",
        justifyContent: centralizado ? "center" : "flex-start",
        alignItems: centralizado ? "center" : undefined,
        gap: centralizado ? "8px" : "6px",
      }

  return (
    <div style={{ ...estilo, borderRight: comBorda ? "1px solid var(--border)" : undefined }}>
      {label && <span style={AREA_LABEL_STYLE}>{label}</span>}
      {children}
    </div>
  )
}

/** Bloco de KPI da área de ação — mesmo padrão de "RELATÓRIO DE PACIENTES / 285" do Modo 1. */
export function WorkbenchKpi({ rotulo, valor, legenda }: { rotulo: string; valor: number; legenda: string }) {
  return (
    <>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {rotulo}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <div style={{ fontSize: "28px", fontWeight: 800, color: B.navy, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {valor}
        </div>
        <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 500 }}>{legenda}</div>
      </div>
    </>
  )
}
