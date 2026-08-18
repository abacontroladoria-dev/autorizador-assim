"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, StickyNote, Trash2 } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { buscarObservacaoPaciente, salvarObservacaoPaciente, excluirObservacaoPaciente } from "@/services/pacienteObservacoes.service"

interface Props {
  pac: string
}

/** Ícone de observações livres por paciente, ao lado do seletor de paciente em /cronograma/ocupacao-paciente — abre um popover com o texto ao clicar. Uma nota por paciente, com trilha de auditoria (ver pacienteObservacoes.service.ts). */
export function ObservacaoPacienteBox({ pac }: Props) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [salvo, setSalvo] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setAberto(false)
    setErro(null)
    if (!pac) { setTexto(""); setSalvo(""); return }
    buscarObservacaoPaciente(pac)
      .then(obs => { setTexto(obs?.texto ?? ""); setSalvo(obs?.texto ?? "") })
      .catch(() => { /* falha silenciosa — só afeta a bolinha indicadora, tentamos de novo ao abrir */ })
  }, [pac])

  useEffect(() => {
    if (!aberto) return
    const close = (e: MouseEvent) => {
      if ((e.target as Element)?.closest("[data-obs-popover]")) return
      setAberto(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [aberto])

  if (!pac) return null

  const alterado = texto.trim() !== salvo.trim()

  function abrir() {
    setAberto(true)
    setErro(null)
    setCarregando(true)
    buscarObservacaoPaciente(pac)
      .then(obs => { setTexto(obs?.texto ?? ""); setSalvo(obs?.texto ?? "") })
      .catch(e => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false))
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const obs = await salvarObservacaoPaciente(pac, texto)
      setTexto(obs.texto)
      setSalvo(obs.texto)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    setSalvando(true)
    setErro(null)
    try {
      await excluirObservacaoPaciente(pac)
      setTexto("")
      setSalvo("")
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
      setConfirmandoExclusao(false)
    }
  }

  const temObservacao = salvo.trim().length > 0

  return (
    <div data-obs-popover style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        title={temObservacao ? "Ver/editar observações" : "Adicionar observações"}
        aria-label="Observações do paciente"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px",
          borderRadius: "7px", border: `1px solid ${temObservacao ? B.amber : "var(--border)"}`,
          background: temObservacao ? B.amberLt : "var(--card)", cursor: "pointer", padding: 0,
        }}
      >
        <StickyNote size={13} color={temObservacao ? B.amber : "var(--muted-foreground)"} />
      </button>

      {aberto && (
        <div
          data-obs-popover
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100, width: "280px",
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
            boxShadow: "0 4px 16px rgba(0,0,0,.12)", padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
          }}
        >
          <label htmlFor="pac-observacoes" style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.02em" }}>
            Observações — {pac}
          </label>
          <textarea
            id="pac-observacoes"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            disabled={carregando || salvando}
            placeholder="Anotações sobre este paciente..."
            rows={4}
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "9px",
              padding: "7px 12px", fontSize: "13px", fontFamily: "inherit", resize: "vertical",
              outline: "none", background: "var(--card)", color: "inherit",
            }}
          />
          {erro && <div style={{ fontSize: "11px", color: "#dc2626", fontWeight: 600 }}>{erro}</div>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={salvar}
              disabled={carregando || salvando || !alterado}
              style={{
                display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "7px",
                fontSize: "11px", fontWeight: 700, fontFamily: "inherit", border: "none",
                background: alterado && !salvando ? B.navy : "#d1d5db", color: "#fff",
                cursor: alterado && !salvando ? "pointer" : "not-allowed",
              }}
            >
              {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
            {salvo && (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={carregando || salvando}
                style={{
                  display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "7px",
                  fontSize: "11px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                  border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626",
                }}
              >
                <Trash2 size={12} />
                Excluir
              </button>
            )}
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <ConfirmDialog
          title="Excluir observação?"
          description={`Excluir a observação salva para "${pac}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          confirmColor="#dc2626"
          onConfirm={confirmarExclusao}
          onCancel={() => setConfirmandoExclusao(false)}
        />
      )}
    </div>
  )
}
