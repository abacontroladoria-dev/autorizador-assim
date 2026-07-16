"use client"

// AlocarSessaoModal — aloca um profissional/terapia num slot livre, edita ou
// move uma alocação existente. Reproduz o fluxo do calculadora-remuneracao:
// "Alocar sessão livre", detecção de profissional já alocado em outro lugar
// (com aviso de troca de unidade) e exclusão de alocação. Só planejamento de
// sala — não cria nem altera nenhum agendamento real na TiTa.
//
// Profissional/terapia são validados contra nomes reais (mesmas fontes de
// sugestão já usadas na Agenda) — não aceita texto livre/digitado errado.

import { useEffect, useRef, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarAlocacao, atualizarAlocacao, excluirAlocacao, buscarSugestoesProfissionaisSalas, buscarTerapiasDoProfissional } from "@/services/salas.service"
import { buscarOpcoesFiltro } from "@/services/agenda.service"
import { normTxt } from "@/lib/cronograma/constants"
import type { Sala } from "@/lib/cronograma/salasTypes"
import type { AlocacaoAtual } from "@/hooks/useOcupacaoSalas"

interface ConfirmacaoPendente {
  title: string
  description: React.ReactNode
  confirmLabel: string
  confirmColor?: string
  onConfirm: () => void
}

interface AlocarSessaoModalProps {
  sala: Sala
  dow: number
  turno: "Manhã" | "Tarde"
  diaLabel: string
  /** Presente quando editando/movendo uma alocação já existente neste slot */
  alocacaoId?: string
  profissionalInicial?: string
  terapiaInicial?: string | null
  encontrarAlocacaoDoProfissional: (
    profissionalNome: string,
    dow: number,
    turno: "Manhã" | "Tarde",
    excetoAlocacaoId?: string,
  ) => AlocacaoAtual | null
  onClose: () => void
  onSaved: () => void
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function AlocarSessaoModal({
  sala, dow, turno, diaLabel, alocacaoId,
  profissionalInicial = "", terapiaInicial = "",
  encontrarAlocacaoDoProfissional, onClose, onSaved,
}: AlocarSessaoModalProps) {
  const [profissional, setProfissional] = useState(profissionalInicial)
  const [profissionalSugestoes, setProfissionalSugestoes] = useState<string[]>([])
  const [profissionalValido, setProfissionalValido] = useState(!!profissionalInicial)
  const [mostrarSugestoesProf, setMostrarSugestoesProf] = useState(false)
  /** Só true depois que o usuário efetivamente digitou algo — evita mostrar "Nenhum profissional encontrado" ao simplesmente focar um campo já preenchido (editar/mover). */
  const [profissionalEditado, setProfissionalEditado] = useState(false)
  const [buscandoProf, setBuscandoProf] = useState(false)

  const [terapia, setTerapia] = useState(terapiaInicial ?? "")
  const [terapiasTodas, setTerapiasTodas] = useState<string[]>([])
  const [terapiasDoProfissional, setTerapiasDoProfissional] = useState<string[] | null>(null)
  const [mostrarSugestoesTerapia, setMostrarSugestoesTerapia] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Sequência da última busca disparada — descarta respostas de buscas antigas que cheguem fora de ordem. */
  const buscaSeqRef = useRef(0)

  useEffect(() => {
    buscarOpcoesFiltro().then(op => setTerapiasTodas(op.terapias.filter(Boolean).sort()))
  }, [])

  // Valida automaticamente se o texto digitado bate exatamente (case-insensitive)
  // com alguma sugestão já retornada pela busca — cobre o caso de o usuário
  // digitar/colar o nome completo certinho sem clicar na lista.
  useEffect(() => {
    if (!profissional.trim()) { setProfissionalValido(false); return }
    if (profissionalSugestoes.some(s => normTxt(s) === normTxt(profissional))) {
      setProfissionalValido(true)
    }
  }, [profissional, profissionalSugestoes])

  // Quando um profissional válido está selecionado, busca só as terapias que
  // ele de fato realiza (histórico real) — restringe a lista em vez de
  // mostrar todas as terapias da clínica.
  useEffect(() => {
    if (!profissionalValido || !profissional.trim()) { setTerapiasDoProfissional(null); return }
    let cancelado = false
    buscarTerapiasDoProfissional(profissional.trim()).then(lista => {
      if (!cancelado) setTerapiasDoProfissional(lista)
    })
    return () => { cancelado = true }
  }, [profissionalValido, profissional])

  function handleProfissionalChange(valor: string) {
    setProfissional(valor)
    setProfissionalEditado(true)
    setProfissionalValido(!!profissionalInicial && normTxt(valor) === normTxt(profissionalInicial))
    setMostrarSugestoesProf(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const minhaSeq = ++buscaSeqRef.current
    if (valor.trim().length < 2) {
      setProfissionalSugestoes([])
      setBuscandoProf(false)
      return
    }
    setBuscandoProf(true)
    debounceRef.current = setTimeout(() => {
      buscarSugestoesProfissionaisSalas(valor.trim()).then(resultado => {
        // Só aplica se nenhuma busca mais nova foi disparada enquanto esta rodava.
        if (minhaSeq !== buscaSeqRef.current) return
        setProfissionalSugestoes(resultado)
        setBuscandoProf(false)
      })
    }, 200)
  }

  function selecionarProfissional(nome: string) {
    setProfissional(nome)
    setProfissionalValido(true)
    setMostrarSugestoesProf(false)
    setProfissionalSugestoes([])
  }

  // Restringe às terapias reais do profissional selecionado quando disponíveis;
  // cai para a lista completa da clínica só se ainda não houver profissional
  // válido selecionado (ou ele não tiver histórico).
  const listaTerapiasBase = terapiasDoProfissional && terapiasDoProfissional.length ? terapiasDoProfissional : terapiasTodas
  const terapiasSugeridas = terapia.trim().length
    ? listaTerapiasBase.filter(t => normTxt(t).includes(normTxt(terapia)))
    : listaTerapiasBase

  const podeSalvar = profissionalValido && profissional.trim().length > 0

  async function persistirAlocacao(nome: string, conflito: AlocacaoAtual | null) {
    setSaving(true)
    setError(null)
    try {
      if (conflito) {
        await atualizarAlocacao(conflito.alocacao.id, {
          sala_id: sala.id, dow, turno, profissional_nome: nome, terapia_nome: terapia.trim() || null,
        })
        if (alocacaoId && alocacaoId !== conflito.alocacao.id) await excluirAlocacao(alocacaoId)
      } else if (alocacaoId) {
        await atualizarAlocacao(alocacaoId, {
          sala_id: sala.id, dow, turno, profissional_nome: nome, terapia_nome: terapia.trim() || null,
        })
      } else {
        await criarAlocacao({ sala_id: sala.id, dow, turno, profissional_nome: nome, terapia_nome: terapia.trim() || null })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar alocação.")
    } finally {
      setSaving(false)
    }
  }

  function handleSalvar() {
    if (!podeSalvar) return
    const nome = profissional.trim()
    const conflito = encontrarAlocacaoDoProfissional(nome, dow, turno, alocacaoId)
    if (conflito) {
      const trocaUnidade = conflito.sala.unidade_nome !== sala.unidade_nome
      setConfirmacao({
        title: "Mover alocação existente?",
        description: (
          <>
            Esse profissional já está alocado em {conflito.sala.unidade_nome} · {conflito.sala.nome_exibicao} · {diaLabel} · {turno}.
            {trocaUnidade && (
              <>{"\n"}<strong>Atenção:</strong> isso configura troca de unidade ({conflito.sala.unidade_nome} → {sala.unidade_nome}).</>
            )}
            {"\n"}Deseja movê-lo para {sala.unidade_nome} · {sala.nome_exibicao}? A alocação anterior será removida.
          </>
        ),
        confirmLabel: "Mover alocação",
        confirmColor: "#d97706",
        onConfirm: () => { setConfirmacao(null); persistirAlocacao(nome, conflito) },
      })
      return
    }
    persistirAlocacao(nome, null)
  }

  function handleExcluir() {
    if (!alocacaoId) return
    setConfirmacao({
      title: "Excluir alocação?",
      description: "Confirma que deseja excluir esta alocação? Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      confirmColor: "#dc2626",
      onConfirm: async () => {
        setConfirmacao(null)
        setSaving(true)
        setError(null)
        try {
          await excluirAlocacao(alocacaoId)
          onSaved()
          onClose()
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao excluir alocação.")
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <ScheduleModal
      title={alocacaoId ? "Editar / mover alocação" : "Alocar sessão livre"}
      subtitle={`${sala.unidade_nome} · ${sala.nome_exibicao} · ${diaLabel} · ${turno}`}
      maxWidth={480}
      onClose={onClose}
      footer={
        <>
          {alocacaoId && (
            <button
              type="button"
              onClick={handleExcluir}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-400"
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saving || !podeSalvar}
            title={!profissionalValido && profissional.trim() ? "Selecione um profissional real da lista de sugestões" : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar alocação
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="relative flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">Profissional</span>
          <input
            className={INPUT_CLS}
            value={profissional}
            onChange={e => handleProfissionalChange(e.target.value)}
            onFocus={() => setMostrarSugestoesProf(true)}
            onBlur={() => setTimeout(() => setMostrarSugestoesProf(false), 150)}
            placeholder="Digite o nome do profissional..."
            autoFocus
          />
          {mostrarSugestoesProf && profissionalEditado && profissional.trim().length >= 2 && (
            <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
              {buscandoProf && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Buscando...
                </div>
              )}
              {!buscandoProf && profissionalSugestoes.length === 0 && (
                <div className="px-2.5 py-1.5 text-xs text-muted-foreground">Nenhum profissional encontrado.</div>
              )}
              {!buscandoProf && profissionalSugestoes.map(nome => (
                <button
                  key={nome}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selecionarProfissional(nome)}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                >
                  {nome}
                </button>
              ))}
            </div>
          )}
          {profissional.trim() && !profissionalValido && (
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              Selecione um profissional da lista (nome deve bater com um profissional real).
            </span>
          )}
        </label>

        <label className="relative flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">
            Terapia
            {terapiasDoProfissional && terapiasDoProfissional.length > 0 && (
              <span className="ml-1.5 font-normal normal-case text-muted-foreground/80">
                (mostrando só as que {profissional.split(" ")[0]} realiza)
              </span>
            )}
          </span>
          <input
            className={INPUT_CLS}
            value={terapia}
            onChange={e => setTerapia(e.target.value)}
            onFocus={() => setMostrarSugestoesTerapia(true)}
            onBlur={() => setTimeout(() => setMostrarSugestoesTerapia(false), 150)}
            placeholder="Digite a terapia..."
          />
          {mostrarSugestoesTerapia && terapiasSugeridas.length > 0 && (
            <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
              {terapiasSugeridas.slice(0, 20).map(nome => (
                <button
                  key={nome}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setTerapia(nome); setMostrarSugestoesTerapia(false) }}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                >
                  {nome}
                </button>
              ))}
            </div>
          )}
        </label>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          Isso é só planejamento de ocupação de sala — não cria nem altera nenhum agendamento real na TiTa.
        </div>
      </div>
      {error && <div className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {confirmacao && (
        <ConfirmDialog
          title={confirmacao.title}
          description={confirmacao.description}
          confirmLabel={confirmacao.confirmLabel}
          confirmColor={confirmacao.confirmColor}
          onConfirm={confirmacao.onConfirm}
          onCancel={() => setConfirmacao(null)}
        />
      )}
    </ScheduleModal>
  )
}
