"use client"

import { useMemo, useState } from "react"
import { ORDEM_DIAS } from "@/types/reposicao"
import { DIA_ABR, fmtData } from "@/lib/cronograma/formatters"
import { extrairUnidade } from "@/lib/cronograma/reposicao"
import { pm } from "@/lib/cronograma/helpers"
import type { ReposicaoStorage, ResultadoReposicao, SessaoAgendada, SessaoConcluida, SugestaoReposicao } from "@/types/reposicao"

// ─── Constantes ───────────────────────────────────────────────────────────────

const HORAS = [
  "08:00","08:40","09:20","10:00","10:40","11:20",
  "13:00","13:40","14:20","15:00","15:40","16:20","17:00",
]

// ─── Tipos internos ───────────────────────────────────────────────────────────

type CellCard = {
  tipo:         "falta" | "proposta" | "concluido" | "futuro" | "reposicao_aceita"
  // Nome mostrado como título do card — prioriza a terapia de AÇÃO (é ela que decide
  // elegibilidade de reposição, ver reposicao.ts), cai para a de exibição se não
  // houver ação.
  terapia:      string
  // Terapia de EXIBIÇÃO (ex.: "Psicologia ABA"), preenchida só quando diverge da
  // de ação (ex.: "Coordenador de Caso") — mesma sessão pode ter as duas por a
  // exibição ser uma categoria de relatório, não o tipo real do atendimento.
  terapiaExibicaoDivergente?: string
  profissional: string
  faltaId?:     string
  // Índice da sugestão em ResultadoReposicao.sugestoes que esta célula representa
  // (só para tipo "proposta" — uma falta pode ter várias opções, uma por célula).
  candidatoIndex?: number
  // Letra que amarra uma FALTA às suas REPOSIÇÕES candidatas (A, B, C...) — mesma
  // letra em todas as células que pertencem à mesma falta, para rastrear na grade
  // quando as opções estão espalhadas em dias/horas diferentes.
  label?: string
  // P1 (mesmo profissional) ou P2 (profissional diferente) — só para "proposta",
  // mostrado sempre, independente de estar selecionada ou não.
  prioridade?: "P1" | "P2"
  // true quando a sessão concluída teve status 'glosa' (convênio negou/questionou
  // o pagamento depois) — sessão ocorreu normalmente, só muda o rótulo exibido.
  glosa?: boolean
}

// Uma célula pode receber mais de uma proposta candidata (de faltas diferentes, ou
// da mesma falta com profissionais diferentes) no mesmo dia+hora — profissionais
// distintos não colidem entre si, então ambos são candidatos válidos. `principal` é
// o que ganha o card cheio (sessão real, ou a 1ª proposta a chegar); `extras` são as
// demais propostas que caem ali, mostradas como marcador — nenhuma opção real é
// descartada da tela, mesmo que várias mirem a mesma célula.
type CellBucket = {
  principal?: CellCard
  extras:     CellCard[]
}

// Resolve os dois campos de terapia de uma sessão pros campos de CellCard: título
// prioriza a ação (é ela que decide elegibilidade de reposição), e a exibição só
// aparece separada (entre parênteses) quando diverge dela — evita repetir a mesma
// string duas vezes na maioria dos casos.
function resolverTerapia(terapiaExibicao: string, terapiaAcao: string): { terapia: string; terapiaExibicaoDivergente?: string } {
  const terapia = terapiaAcao || terapiaExibicao
  return {
    terapia,
    terapiaExibicaoDivergente: terapiaExibicao && terapiaExibicao !== terapia ? terapiaExibicao : undefined,
  }
}

// Pontuação usada pela "Sugestão automática" (ver calcularSugestaoAutomatica): P1
// vale menos que ficar no mesmo dia de outra reposição, que por sua vez vale menos
// que encaixar perfeitamente ao lado dela (sessões de 40min — "sem intervalo" é
// ficar a exatamente 40min de distância). De propósito: é melhor trocar UM "mesmo
// prof." por um "prof. diferente" se isso permite formar um bloco contíguo com
// várias outras faltas no mesmo dia, em vez de travar cada falta isolada assim que
// é processada. E é melhor ter duas sessões no mesmo dia (mesmo sem encostar) do
// que deixar uma sessão "sozinha" — sem nenhuma outra reposição naquele dia.
const PONTOS_MESMO_PROF      = 200
const PONTOS_MESMO_DIA       = 80
const PONTOS_ENCAIXE_PERFEITO = 1000

function pontuarPar(a: { data: string; hora: string }, b: { data: string; hora: string }): number {
  if (a.data !== b.data) return 0
  const dist = Math.abs((pm(a.hora) ?? 0) - (pm(b.hora) ?? 0))
  return dist === 40 ? PONTOS_ENCAIXE_PERFEITO : PONTOS_MESMO_DIA
}

type ComSugestao = Extract<ResultadoReposicao, { status: "com_sugestao" }>

// Calcula a "sugestão automática": uma reposição por CADA falta disponível,
// balanceando MESMO PROF., blocos sem intervalo e evitando sessões "sozinhas" num
// dia sem nenhuma outra reposição — sem nunca deixar duas faltas convergirem pro
// mesmo data+hora exato. Determinística: a mesma entrada sempre produz a mesma
// saída (nada de aleatório), pra não "trocar de ideia" a cada clique no botão. É a
// mesma lógica usada tanto como estado INICIAL da grade (assim que o
// paciente/semana carrega) quanto pelo botão "Sugestão automática".
//
// Reotimiza uma falta de cada vez (coordinate descent), mas isso sozinho empaca
// quando a melhoria só aparece se DUAS faltas se moverem JUNTAS — ex.: duas faltas
// isoladas em dias diferentes que, juntas, formariam um bloco contíguo numa Quinta
// livre: mover só uma delas não melhora nada sozinha, então nenhuma tem incentivo
// pra sair do lugar onde travou. Por isso testa vários pontos de partida diferentes
// e fica com o que tiver a maior pontuação total no fim — em vez de reinícios
// aleatórios (que davam um resultado diferente a cada clique), os pontos de partida
// são fixos: um "guloso" (melhor prioridade sozinha) e um por dia da semana
// (tentando agrupar o máximo de faltas possível naquele dia).
function calcularSugestaoAutomatica(
  comSugestao: ComSugestao[],
  aceites: ReposicaoStorage,
): { escolhas: Record<string, number>; selecionados: Set<string> } {
  const jaAceitas = Object.values(aceites)
    .filter(a => a.status === "aceito" && a.sugestao)
    .map(a => ({ data: a.sugestao!.data, hora: a.sugestao!.hora }))

  type Item = { faltaId: string; sugestoes: SugestaoReposicao[]; indice: number }

  // Duas faltas diferentes nunca podem terminar no mesmo data+hora — mesmo com
  // profissionais diferentes, é o MESMO paciente, que não pode estar em duas
  // sessões ao mesmo tempo. Isso não é filtrado antes: o algoritmo em
  // reposicao.ts só reserva por terapia+profissional+data+hora, então duas
  // faltas de terapias diferentes podem ter candidatos válidos independentes no
  // mesmo horário — só vira problema se ambas acabarem escolhendo o mesmo.
  function temConflitoExato(estado: Item[], idx: number, candidato: SugestaoReposicao): boolean {
    const colideCom = (o: { data: string; hora: string }) => o.data === candidato.data && o.hora === candidato.hora
    if (jaAceitas.some(colideCom)) return true
    return estado.some((outra, j) => j !== idx && colideCom(outra.sugestoes[outra.indice]))
  }

  // Pontuação de escolher `candidato` pra falta `idx`, dado o estado ATUAL de
  // todas as outras faltas (e das reposições já aceitas, como âncoras fixas).
  function pontuar(estado: Item[], idx: number, candidato: SugestaoReposicao): number {
    let score = candidato.prioridade === "P1" ? PONTOS_MESMO_PROF : 0
    jaAceitas.forEach(a => { score += pontuarPar(candidato, a) })
    estado.forEach((outra, j) => {
      if (j === idx) return
      score += pontuarPar(candidato, outra.sugestoes[outra.indice])
    })
    return score
  }

  // Pontuação total de um estado completo — usada só pra comparar tentativas
  // diferentes entre si no fim, não durante as passadas.
  function pontuarTotal(estado: Item[]): number {
    let total = 0
    estado.forEach((item, idx) => {
      const s = item.sugestoes[item.indice]
      total += s.prioridade === "P1" ? PONTOS_MESMO_PROF : 0
      jaAceitas.forEach(a => { total += pontuarPar(s, a) })
      for (let j = idx + 1; j < estado.length; j++) {
        total += pontuarPar(s, estado[j].sugestoes[estado[j].indice])
      }
    })
    return total
  }

  function otimizar(estadoInicial: Item[]): Item[] {
    const estado = estadoInicial.map(item => ({ ...item }))
    const PASSADAS = 6
    for (let passo = 0; passo < PASSADAS; passo++) {
      estado.forEach((item, idx) => {
        let melhorIndice = item.indice
        let melhorScore = -Infinity
        item.sugestoes.forEach((s, i) => {
          if (temConflitoExato(estado, idx, s)) return  // nunca escolhe horário já ocupado por outra falta
          const score = pontuar(estado, idx, s)
          if (score > melhorScore) {
            melhorScore = score
            melhorIndice = i
          }
        })
        // Se toda opção colide com alguma outra falta já escolhida (raro), mantém
        // a escolha anterior em vez de travar sem decisão — passadas seguintes
        // tendem a resolver isso conforme as outras faltas também se movem.
        if (melhorScore !== -Infinity) item.indice = melhorIndice
      })
    }
    return estado
  }

  const base: Item[] = comSugestao.map(r => ({ faltaId: r.falta.faltaId, sugestoes: r.sugestoes, indice: 0 }))

  function indicePreferencial(item: Item, diaPreferido: string | null): number {
    if (diaPreferido) {
      const idx = item.sugestoes.findIndex(s => s.dia === diaPreferido && s.prioridade === "P1")
      if (idx >= 0) return idx
      const idxQualquer = item.sugestoes.findIndex(s => s.dia === diaPreferido)
      if (idxQualquer >= 0) return idxQualquer
    }
    const temP1 = item.sugestoes.some(s => s.prioridade === "P1")
    return temP1 ? item.sugestoes.findIndex(s => s.prioridade === "P1") : 0
  }

  // Pontos de partida fixos (nada de aleatório, pra sempre dar o mesmo resultado):
  // um guloso (melhor prioridade de cada falta, ignorando os dias das outras) e um
  // por dia da semana (tentando puxar o máximo de faltas possível pra aquele dia,
  // o que ajuda o coordinate descent a já começar perto de um bloco agrupado em vez
  // de ter que descobri-lo sozinho).
  const diasCandidatos: (string | null)[] = [null, ...ORDEM_DIAS]

  let melhorResultado: Item[] = base
  let melhorPontuacao = -Infinity

  diasCandidatos.forEach(dia => {
    const estadoInicial = base.map(item => ({ ...item, indice: Math.max(0, indicePreferencial(item, dia)) }))
    const resultado = otimizar(estadoInicial)
    const pontuacao = pontuarTotal(resultado)
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao
      melhorResultado = resultado
    }
  })

  const escolhas: Record<string, number> = {}
  const selecionados = new Set<string>()
  melhorResultado.forEach(item => {
    escolhas[item.faltaId] = item.indice
    selecionados.add(item.faltaId)
  })

  return { escolhas, selecionados }
}

// ─── Card individual ─────────────────────────────────────────────────────────

function SessionCard({
  card,
  selected,
  compact,
  highlighted,
  onToggle,
  onRecusarAceito,
  onHoverEnter,
  onHoverLeave,
}: {
  card:     CellCard
  selected: boolean
  // true quando esta proposta está "sobrando" numa célula que já tem outra coisa
  // (outra proposta, ou a sessão principal) — marcador reduzido, sem centralizar
  // verticalmente numa célula inteira de 76px.
  compact?: boolean
  // true quando outro card/marcador da MESMA falta está sob o mouse — destaca este
  // também, para localizar rapidamente todas as opções espalhadas pela grade.
  highlighted?: boolean
  onToggle: () => void
  onRecusarAceito: () => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
}) {
  const isProposta        = card.tipo === "proposta"
  const isFalta            = card.tipo === "falta"
  const isConcluido        = card.tipo === "concluido"
  const isFuturo           = card.tipo === "futuro"
  const isReposicaoAceita  = card.tipo === "reposicao_aceita"

  const style = (() => {
    if (isFalta) return {
      bg:     "#fffbeb",
      border: "#fcd34d",
      nameC:  "#92400e",
      profC:  "#b45309",
    }
    if (isReposicaoAceita) return {
      bg:     "#f0fdf4",
      border: "#86efac",
      nameC:  "#166534",
      profC:  "#16a34a",
    }
    if (isProposta && selected) return {
      bg:     "#f0fdf4",
      border: "#86efac",
      nameC:  "#166534",
      profC:  "#16a34a",
    }
    if (isConcluido) return {
      bg:     "#f8fafc",
      border: "#e2e8f0",
      nameC:  "#334155",
      profC:  "#94a3b8",
    }
    if (isFuturo) return {
      bg:     "#eff6ff",
      border: "#bfdbfe",
      nameC:  "#1e3a8a",
      profC:  "#3b82f6",
    }
    return {
      bg:     "#ffffff",
      border: "#e2e8f0",
      nameC:  "#0f172a",
      profC:  "#94a3b8",
    }
  })()

  // Opção não escolhida de uma falta com múltiplos candidatos (ou uma opção
  // "extra" que perdeu a célula para outra coisa, mesmo sendo a escolhida da sua
  // própria falta — caso raro de duas faltas escolhendo o mesmo dia+hora): em vez
  // de repetir o card inteiro em cada célula (poluía a grade quando havia dezenas
  // de opções), mostra só um marcador mínimo — a letra da falta, colorida por
  // prioridade — que ainda é clicável para virar a opção escolhida. Detalhe
  // completo via tooltip.
  if (isProposta && (compact || !selected)) {
    const corPrioridade = card.prioridade === "P1" ? "#1d4ed8" : "#c2410c"
    const bgPrioridade  = card.prioridade === "P1" ? "#eff6ff" : "#fff7ed"
    const borderPrioridade = card.prioridade === "P1" ? "#bfdbfe" : "#fed7aa"
    const tooltip = [
      card.terapia,
      card.profissional,
      card.prioridade === "P1" ? "mesmo profissional" : "profissional diferente",
      "— clique para escolher esta reposição",
    ].filter(Boolean).join(" · ")

    // Tamanho e espaçamento sempre iguais, principal ou extra — antes um marcador
    // "principal" sozinho ocupava a célula inteira (76px, centralizado) enquanto os
    // "extras" empilhados abaixo ficavam compactos, e a mistura dos dois tamanhos na
    // mesma coluna é o que deixava as letras "embolodas". Agora todo marcador usa a
    // mesma caixa fixa de 28px, alinhados num grid — a célula some fica mais curta,
    // sem centralizar, e várias juntas formam uma grade organizada.
    return (
      <div
        onClick={onToggle}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
        title={tooltip}
        style={{
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 800,
            background: bgPrioridade,
            color: corPrioridade,
            border: `1.5px solid ${borderPrioridade}`,
            boxShadow: highlighted ? `0 0 0 3px ${corPrioridade}55` : "none",
            transform: highlighted ? "scale(1.15)" : "scale(1)",
            transition: "transform 0.12s, box-shadow 0.12s",
          }}
        >
          {card.label ?? "?"}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => isProposta && onToggle()}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        borderRadius: 8,
        border: `1px solid ${style.border}`,
        background: style.bg,
        padding: "8px 10px",
        minHeight: 76,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxShadow: highlighted ? "0 0 0 3px rgba(37,99,235,0.25)" : "none",
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.12s",
        cursor: isProposta ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Indicador de tipo */}
      {isFalta && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#b45309",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Falta{card.label ? ` ${card.label}` : ""}
        </span>
      )}
      {isReposicaoAceita && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#16a34a",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          ✓ Reposição{card.label ? ` ${card.label}` : ""}
        </span>
      )}
      {isProposta && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: selected ? "#16a34a" : "#64748b",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {selected ? "✓ " : ""}Reposição{card.label ? ` ${card.label}` : ""}
        </span>
      )}
      {isConcluido && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#64748b",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          ✓ Concluído{card.glosa ? " (Glosa)" : ""}
        </span>
      )}
      {isFuturo && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#3b82f6",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Futuro
        </span>
      )}

      {/* Nome da terapia (ação) */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: style.nameC,
          lineHeight: 1.3,
          paddingRight: 22,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}
      >
        {card.terapia || "—"}
      </div>

      {/* Terapia de exibição — só aparece quando diverge da ação (ex.: uma sessão de
          "Coordenador de Caso" pode ser exibida como "Psicologia ABA" por ser a
          categoria de relatório, mas a ação é o que decide elegibilidade de reposição). */}
      {card.terapiaExibicaoDivergente && (
        <div
          style={{
            fontSize: 12,
            color: style.profC,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ({card.terapiaExibicaoDivergente})
        </div>
      )}

      {/* Profissional */}
      <div
        style={{
          fontSize: 12,
          color: style.profC,
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {card.profissional || "—"}
      </div>

      {/* Mesmo prof. / prof. diferente — sempre visível, independente de seleção */}
      {isProposta && card.prioridade && (
        <span style={{
          display: "inline-block", marginTop: 4, alignSelf: "flex-start",
          fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 5px",
          background: card.prioridade === "P1" ? "#eff6ff" : "#fff7ed",
          color: card.prioridade === "P1" ? "#1d4ed8" : "#c2410c",
          border: `1px solid ${card.prioridade === "P1" ? "#bfdbfe" : "#fed7aa"}`,
        }}>
          {card.prioridade === "P1" ? "MESMO PROF." : "PROF. DIFERENTE"}
        </span>
      )}

      {/* Botão Recusar — proposta selecionada (transiente) ou reposição já aceita (persistida) */}
      {(isReposicaoAceita || (isProposta && selected)) && (
        <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={e => { e.stopPropagation(); isReposicaoAceita ? onRecusarAceito() : onToggle() }}
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#dc2626",
              lineHeight: 1.6,
            }}
          >
            Recusar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Célula vazia ─────────────────────────────────────────────────────────────

function EmptyCell() {
  return (
    <div style={{ minHeight: 76, borderRadius: 8, border: "1px solid transparent" }} />
  )
}

// ─── Chip na barra inferior ───────────────────────────────────────────────────

function PropostaChip({ dia, hora, terapia }: { dia: string; hora: string; terapia: string }) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: 8,
        padding: "5px 12px",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 700, color: "#166534" }}>{DIA_ABR[dia] ?? dia} · {hora}</div>
      <div style={{ color: "#15803d", marginTop: 1 }}>{terapia}</div>
    </div>
  )
}

// ─── Painel de resumo (direita) ───────────────────────────────────────────────

interface PainelResumoProps {
  resultados:        ResultadoReposicao[]
  sessoesAgendadas:  SessaoAgendada[]
  selecionados:      Set<string>
  escolhas:          Record<string, number>  // faltaId -> índice da sugestão escolhida
  faltaLabel:        Record<string, string>  // faltaId -> letra (mesma da grade)
  totalPendentes:    number
  onSelecionarTudo:  () => void
  onLimparSelecao:   () => void
}

// Primeiros dois nomes significativos (ignora partículas como "de", "da", "do")
function doisNomes(nome: string): string {
  const words = nome.split(' ')
  const result: string[] = []
  let count = 0
  for (const w of words) {
    result.push(w)
    if (w.length > 2) count++
    if (count >= 2) break
  }
  return result.join(' ').toUpperCase()
}

// Remove "Aplicador " do início; mantém o restante em maiúsculas
function abrevTerapia(t: string): string {
  return t.replace(/^Aplicador\s+/i, '').toUpperCase()
}

function PainelResumo({
  resultados,
  sessoesAgendadas,
  selecionados,
  escolhas,
  faltaLabel,
  totalPendentes,
  onSelecionarTudo,
  onLimparSelecao,
}: PainelResumoProps) {
  const faltas = resultados.map(r => r.falta)
  const comSugestao = resultados.filter(r => r.status === "com_sugestao")

  // Sugestão escolhida para uma falta (padrão: a melhor, índice 0, até o usuário
  // trocar clicando em outra opção na grade).
  function sugestaoEscolhida(r: Extract<ResultadoReposicao, { status: "com_sugestao" }>): SugestaoReposicao {
    return r.sugestoes[escolhas[r.falta.faltaId] ?? 0] ?? r.sugestoes[0]
  }

  // Detecção de unidade(s).
  // Sugestão só entra como fallback quando falta.unidade está vazio — evita poluir
  // o conjunto com unidades de reposições cross-unit, causando "3 unidades" falso.
  const todasUnidades = new Set<string>()
  faltas.forEach(f => { if (f.unidade) todasUnidades.add(extrairUnidade(f.unidade)) })
  sessoesAgendadas.forEach(s => { if (s.unidade) todasUnidades.add(extrairUnidade(s.unidade)) })
  comSugestao.forEach(r => {
    const sug = sugestaoEscolhida(r)
    if (!r.falta.unidade && sug?.unidade) {
      todasUnidades.add(extrairUnidade(sug.unidade))
    }
  })
  const unidades = [...todasUnidades]

  // Unidade majoritária — base para detectar qual sessão destoa.
  const unidContagem: Record<string, number> = {}
  faltas.forEach(f => {
    const u = f.unidade ? extrairUnidade(f.unidade) : null
    if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
  })
  sessoesAgendadas.forEach(s => {
    const u = s.unidade ? extrairUnidade(s.unidade) : null
    if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
  })
  // Quando faltas e sessões agendadas não têm unidade identificada (slot liberado),
  // usa as unidades das sugestões como proxy para determinar a unidade habitual.
  if (Object.keys(unidContagem).length === 0) {
    comSugestao.forEach(r => {
      const sug = sugestaoEscolhida(r)
      const u = sug?.unidade ? extrairUnidade(sug.unidade) : null
      if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
    })
  }
  const unidMajoritaria = Object.entries(unidContagem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: "#f8fafc",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        padding: "18px 16px",
        alignSelf: "flex-start",
        position: "sticky",
        top: 16,
        fontSize: 12,
        color: "#334155",
        lineHeight: 1.5,
      }}
    >
      {/* Cabeçalho */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
        textTransform: "uppercase", color: "#94a3b8", marginBottom: 8,
      }}>
        Faltou · {faltas.length} &nbsp;/&nbsp; Pode repor · {comSugestao.length}
      </div>

      {/* Selecionar tudo / Limpar seleção */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button
          type="button"
          onClick={onSelecionarTudo}
          disabled={totalPendentes === 0}
          style={{
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            cursor: totalPendentes === 0 ? "default" : "pointer",
            fontFamily: "inherit",
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#16a34a",
            opacity: totalPendentes === 0 ? 0.5 : 1,
          }}
        >
          Selecionar tudo
        </button>
        <button
          type="button"
          onClick={onLimparSelecao}
          disabled={selecionados.size === 0}
          style={{
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            cursor: selecionados.size === 0 ? "default" : "pointer",
            fontFamily: "inherit",
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#dc2626",
            opacity: selecionados.size === 0 ? 0.5 : 1,
          }}
        >
          Limpar seleção
        </button>
      </div>

      {/* Linhas pareadas: falta + reposição logo abaixo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {resultados.map(r => {
          const f = r.falta
          const bestSug = r.status === "com_sugestao" ? sugestaoEscolhida(r) : null
          const outrasOpcoes = r.status === "com_sugestao" ? r.sugestoes.length - 1 : 0
          const selected = selecionados.has(f.faltaId)
          const faltaUnid = f.unidade ? extrairUnidade(f.unidade) : null
          const isOutlier = unidades.length > 1 && unidMajoritaria !== null
            && faltaUnid !== null && faltaUnid !== unidMajoritaria

          return (
            <div key={f.faltaId} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              {/* Falta */}
              <div style={{
                flex: 1, minWidth: 0,
                background: "#fffbeb",
                border: `1px solid ${isOutlier ? "#f97316" : "#fcd34d"}`,
                borderRadius: 8,
                padding: "6px 10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#92400e", fontSize: 11 }}>
                      {(DIA_ABR[f.dia] ?? f.dia).toUpperCase()} · {f.hora}
                      {faltaLabel[f.faltaId] && (
                        <span style={{ color: "#b45309", fontWeight: 800 }}> · {faltaLabel[f.faltaId]}</span>
                      )}
                    </div>
                    <div style={{ color: "#b45309", fontSize: 11, marginTop: 1 }}>
                      {abrevTerapia(f.terapiaExibicao || f.terapia)}
                    </div>
                    {f.profissional && (
                      <div style={{ color: "#d97706", fontSize: 10, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doisNomes(f.profissional)}
                      </div>
                    )}
                  </div>
                  {isOutlier && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, flexShrink: 0,
                      background: "#fff7ed", color: "#ea580c",
                      border: "1px solid #fdba74", borderRadius: 4, padding: "1px 5px",
                    }}>
                      ⚠ {faltaUnid}
                    </span>
                  )}
                </div>
              </div>

              {/* Reposição ou status */}
              {bestSug ? (
                <div style={{
                  flex: 1, minWidth: 0,
                  background: selected ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${selected ? "#86efac" : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "6px 10px 7px 10px",
                }}>
                  <div style={{ fontWeight: 700, color: selected ? "#166534" : "#334155", fontSize: 11 }}>
                    {(DIA_ABR[bestSug.dia] ?? bestSug.dia).toUpperCase()} · {bestSug.hora}
                  </div>
                  <div style={{
                    color: selected ? "#15803d" : "#64748b", fontSize: 10, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {doisNomes(bestSug.profissional)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-block",
                      fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 5px",
                      background: bestSug.prioridade === "P1" ? "#eff6ff" : "#fff7ed",
                      color: bestSug.prioridade === "P1" ? "#1d4ed8" : "#c2410c",
                      border: `1px solid ${bestSug.prioridade === "P1" ? "#bfdbfe" : "#fed7aa"}`,
                    }}>
                      {selected ? "✓ " : ""}{bestSug.prioridade === "P1" ? "MESMO PROF." : "PROF. DIFERENTE"}
                    </span>
                    {outrasOpcoes > 0 && (
                      <span style={{ fontSize: 9, color: "#94a3b8", fontStyle: "italic" }}>
                        +{outrasOpcoes} opç{outrasOpcoes !== 1 ? "ões" : "ão"} na grade
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{
                  flex: 1, minWidth: 0,
                  background: r.status === "sem_disponibilidade" ? "#fef2f2" : "#f8fafc",
                  border: `1px solid ${r.status === "sem_disponibilidade" ? "#fca5a5" : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "5px 10px 5px 10px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    color: r.status === "sem_disponibilidade" ? "#dc2626" : "#94a3b8",
                    fontSize: 10, fontStyle: "italic", textAlign: "center",
                  }}>
                    {r.status === "sem_disponibilidade" ? "sem disponibilidade"
                      : r.status === "irrecuperavel" ? "irrecuperável"
                      : "sem dados"}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Unidade */}
      {unidades.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: 8,
          }}>
            Unidade
          </div>
          {unidades.length === 1 ? (
            /* Caso simples: todas as sessões na mesma unidade */
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{unidades[0]}</span>
            </div>
          ) : (
            /* Caso multi-unidade: mostra a habitual + destaca quais faltas fogem dela */
            <div>
              {/* Unidade habitual */}
              {unidMajoritaria && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{unidMajoritaria}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>habitual</span>
                </div>
              )}
              {/* Faltas em unidade diferente da habitual */}
              {(() => {
                const outliers = faltas.filter(f => {
                  if (!f.unidade) return false
                  return extrairUnidade(f.unidade) !== unidMajoritaria
                })
                const outliersAgend = sessoesAgendadas.filter(s => {
                  if (!s.unidade) return false
                  return extrairUnidade(s.unidade) !== unidMajoritaria
                })
                if (outliers.length === 0 && outliersAgend.length === 0) return null
                return (
                  <div style={{
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 7,
                    padding: "7px 10px",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", marginBottom: 5 }}>
                      ⚠ Destoa da unidade habitual:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {outliers.map(f => (
                        <div key={f.faltaId} style={{ fontSize: 10, color: "#92400e" }}>
                          <span style={{ fontWeight: 700 }}>
                            {DIA_ABR[f.dia] ?? f.dia} {f.hora}
                          </span>
                          {" · "}
                          <span>{f.terapiaExibicao || f.terapia}</span>
                          <span style={{ color: "#c2410c", marginLeft: 4, fontWeight: 700 }}>
                            → {extrairUnidade(f.unidade)}
                          </span>
                        </div>
                      ))}
                      {outliersAgend.map((s, i) => (
                        <div key={i} style={{ fontSize: 10, color: "#64748b" }}>
                          <span style={{ fontWeight: 700 }}>
                            {DIA_ABR[s.dia] ?? s.dia} {s.hora}
                          </span>
                          {" · "}
                          <span>{s.terapiaExibicao || s.terapia}</span>
                          <span style={{ color: "#c2410c", marginLeft: 4, fontWeight: 700 }}>
                            → {extrairUnidade(s.unidade)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface VisaoComparativaProps {
  pacienteNome:      string
  resultados:        ResultadoReposicao[]
  sessoesAgendadas:  SessaoAgendada[]
  sessoesConcluidas: SessaoConcluida[]
  aceites:           ReposicaoStorage
  semanaInicio:      string
  onAceitar:         (escolhas: { faltaId: string; sugestao: SugestaoReposicao }[]) => void
  onRecusarAceito:   (faltaId: string) => void
}

export function VisaoComparativa({
  pacienteNome,
  resultados,
  sessoesAgendadas,
  sessoesConcluidas,
  aceites,
  semanaInicio,
  onAceitar,
  onRecusarAceito,
}: VisaoComparativaProps) {
  // faltaIds já resolvidos (aceito ou recusado) não devem mais aparecer como
  // proposta pendente — aceito ganha seu próprio card (reposicao_aceita).
  const resolvidos = useMemo(
    () => new Set(
      Object.entries(aceites)
        .filter(([, v]) => v.status === "aceito" || v.status === "recusado")
        .map(([id]) => id),
    ),
    [aceites],
  )

  const comSugestao = useMemo(
    () => resultados.filter(
      (r): r is Extract<ResultadoReposicao, { status: "com_sugestao" }> =>
        r.status === "com_sugestao" && !resolvidos.has(r.falta.faltaId),
    ),
    [resultados, resolvidos],
  )

  // Faltas já decididas (aceita ou recusada) saem da lista do painel lateral — uma
  // aceita já tem seu próprio card verde na grade, e uma recusada não deve continuar
  // aparecendo como se tivesse uma sugestão pendente esperando decisão.
  const resultadosPendentes = useMemo(
    () => resultados.filter(r => !resolvidos.has(r.falta.faltaId)),
    [resultados, resolvidos],
  )

  // Estado inicial já vem da "sugestão automática" (ver calcularSugestaoAutomatica)
  // em vez de só marcar as faltas com MESMO PROF. — assim que a semana carrega, a
  // grade já mostra o melhor lote calculado (balanceando prioridade e blocos sem
  // intervalo), e o coordenador ajusta manualmente a partir daí se quiser.
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => calcularSugestaoAutomatica(comSugestao, aceites).selecionados,
  )
  // Qual sugestão (índice em ResultadoReposicao.sugestoes) está escolhida para cada
  // falta — mesmo padrão inicial da sugestão automática.
  const [escolhas, setEscolhas] = useState<Record<string, number>>(
    () => calcularSugestaoAutomatica(comSugestao, aceites).escolhas,
  )

  // Data de cada dia da semana
  const diaToDate = useMemo(() => {
    const map: Record<string, string> = {}
    const d = new Date(`${semanaInicio}T12:00:00`)
    ORDEM_DIAS.forEach(dia => {
      map[dia] = d.toISOString().slice(0, 10)
      d.setDate(d.getDate() + 1)
    })
    return map
  }, [semanaInicio])

  // faltaId sob o mouse no momento — acende todo card/marcador da mesma falta
  // espalhado pela grade, pra localizar rápido quais opções pertencem a ela.
  const [hoverFaltaId, setHoverFaltaId] = useState<string | null>(null)

  // Letra que amarra cada falta às suas reposições candidatas na grade (A, B, C...
  // AA, AB... se passar de 26). Mesma ordem de `resultados`, estável entre renders.
  const faltaLabel = useMemo(() => {
    const map: Record<string, string> = {}
    resultados.forEach((r, i) => {
      let n = i
      let label = ""
      do {
        label = String.fromCharCode(65 + (n % 26)) + label
        n = Math.floor(n / 26) - 1
      } while (n >= 0)
      map[r.falta.faltaId] = label
    })
    return map
  }, [resultados])

  // Grade: hora → dia → bucket (principal + extras)
  // Precedência para "principal": falta > reposição aceita > concluído > proposta
  // escolhida > proposta não escolhida > futuro. Propostas que perdem a disputa pela
  // célula (outra falta, ou outro profissional, mirando o mesmo dia+hora — coisa que
  // acontece de verdade, já que profissionais diferentes no mesmo horário não são
  // conflito entre si) não somem: viram "extras", mostradas como marcador na mesma
  // célula. Nenhuma opção real deixa de aparecer em algum lugar clicável da grade.
  const { grid, horasAtivas, diasAtivos } = useMemo(() => {
    const g: Record<string, Record<string, CellBucket>> = {}

    function ensure(hora: string, dia: string): CellBucket {
      if (!g[hora]) g[hora] = {}
      if (!g[hora][dia]) g[hora][dia] = { extras: [] }
      return g[hora][dia]
    }

    // Sessões "reais" (não-proposta): primeira a chegar vence a célula, sem virar extra
    // — colisão entre elas não deveria acontecer para o mesmo paciente (o algoritmo já
    // evita propor um slot em cima da própria agenda), então não há uma boa forma de
    // mostrar duas ao mesmo tempo; mantém o comportamento anterior nesse caso raro.
    function setPrincipal(hora: string, dia: string, c: CellCard) {
      const cell = ensure(hora, dia)
      if (!cell.principal) cell.principal = c
    }

    // Proposta: se a célula está livre, vira principal (card cheio ou marcador,
    // dependendo se é a escolhida). Se já tem alguma coisa, vira extra (marcador
    // empilhado junto do que já está lá) — nunca é descartada.
    function addProposta(hora: string, dia: string, c: CellCard) {
      const cell = ensure(hora, dia)
      if (!cell.principal) cell.principal = c
      else cell.extras.push(c)
    }

    // 1º: sessões faltadas (amarelo) — sempre visível para o coordenador agir
    resultados.forEach(r => {
      const f = r.falta
      setPrincipal(f.hora, f.dia as string, {
        tipo: "falta",
        ...resolverTerapia(f.terapiaExibicao, f.terapia),
        profissional: f.profissional,
        faltaId: f.faltaId,
        label: faltaLabel[f.faltaId],
      })
    })

    // 2º: reposições já aceitas (persistidas em localStorage)
    // `aceites` é global (localStorage único para todos os pacientes/semanas) — sem o
    // filtro por faltaIdsSemana, uma reposição aceita de OUTRO paciente ou de OUTRA
    // semana, cuja sugestão caísse no mesmo dia da semana + hora, vazaria para esta
    // grade (o match era feito só por dia/hora, sem checar a que paciente/semana
    // pertence). Só exibimos aqui reposições cujo faltaId é uma falta desta semana
    // deste paciente (presente em `resultados`).
    const faltaIdsSemana = new Set(resultados.map(r => r.falta.faltaId))
    Object.entries(aceites).forEach(([faltaId, entry]) => {
      if (entry.status !== "aceito" || !entry.sugestao) return
      if (!faltaIdsSemana.has(faltaId)) return
      const s = entry.sugestao
      setPrincipal(s.hora, s.dia as string, {
        tipo: "reposicao_aceita",
        ...resolverTerapia(s.terapiaExibicao, s.terapia),
        profissional: s.profissional,
        faltaId,
        label: faltaLabel[faltaId],
      })
    })

    // 3º: sessões concluídas (paciente já compareceu)
    sessoesConcluidas.forEach(s =>
      setPrincipal(s.hora, s.dia, {
        tipo: "concluido",
        ...resolverTerapia(s.terapiaExibicao, s.terapia),
        profissional: s.profissional,
        glosa: s.glosa,
      }),
    )

    // 4º: propostas de reposição pendentes (já exclui faltaIds resolvidos) — mostra
    // TODAS as opções calculadas para cada falta, não só a melhor. Em duas passadas:
    // primeiro a opção ESCOLHIDA de cada falta (para ela ter prioridade de virar o
    // card cheio da célula), depois as demais. O usuário escolhe clicando; só uma
    // fica marcada como "escolhida" por vez (ver `escolhas`).
    comSugestao.forEach(r => {
      const escolhaIndex = escolhas[r.falta.faltaId] ?? 0
      const s = r.sugestoes[escolhaIndex]
      if (!s) return
      addProposta(s.hora, s.dia as string, {
        tipo: "proposta",
        ...resolverTerapia(s.terapiaExibicao, s.terapia),
        profissional: s.profissional,
        faltaId: r.falta.faltaId,
        candidatoIndex: escolhaIndex,
        label: faltaLabel[r.falta.faltaId],
        prioridade: s.prioridade,
      })
    })
    comSugestao.forEach(r => {
      const escolhaIndex = escolhas[r.falta.faltaId] ?? 0
      r.sugestoes.forEach((s, i) => {
        if (i === escolhaIndex) return  // já inserida na passada acima
        addProposta(s.hora, s.dia as string, {
          tipo: "proposta",
          ...resolverTerapia(s.terapiaExibicao, s.terapia),
          profissional: s.profissional,
          faltaId: r.falta.faltaId,
          candidatoIndex: i,
          label: faltaLabel[r.falta.faltaId],
          prioridade: s.prioridade,
        })
      })
    })

    // 5º: sessões futuras agendadas (ainda não ocorreram)
    sessoesAgendadas.forEach(s =>
      setPrincipal(s.hora, s.dia, {
        tipo: "futuro",
        ...resolverTerapia(s.terapiaExibicao, s.terapia),
        profissional: s.profissional,
      }),
    )

    const horasAtivas = HORAS.filter(h => h in g)
    // Sempre mostra Seg-Sex, mesmo sem conteúdo — colunas com largura reservada em
    // vez de colapsar quando o paciente não tem nada num dia específico.
    const diasAtivos = ORDEM_DIAS

    return { grid: g, horasAtivas, diasAtivos }
  }, [resultados, sessoesAgendadas, sessoesConcluidas, aceites, comSugestao, faltaLabel, escolhas])

  const propostasSel = comSugestao
    .filter(r => selecionados.has(r.falta.faltaId))
    .map(r => ({ faltaId: r.falta.faltaId, sug: r.sugestoes[escolhas[r.falta.faltaId] ?? 0] ?? r.sugestoes[0] }))

  // Clique numa célula de proposta: se já é a opção escolhida para essa falta,
  // desmarca (desiste da reposição). Senão, torna essa a opção escolhida — só uma
  // sugestão pode estar ativa por falta, mesmo havendo várias na grade.
  function selecionarCandidato(faltaId: string, index: number) {
    const escolhaAtual = escolhas[faltaId] ?? 0
    const jaEhEscolhaAtiva = selecionados.has(faltaId) && escolhaAtual === index
    if (jaEhEscolhaAtiva) {
      setSelecionados(prev => {
        const next = new Set(prev)
        next.delete(faltaId)
        return next
      })
      return
    }

    const candidato = comSugestao.find(r => r.falta.faltaId === faltaId)?.sugestoes[index]

    setEscolhas(prev => ({ ...prev, [faltaId]: index }))
    setSelecionados(prev => {
      const next = new Set(prev)
      next.add(faltaId)
      // Duas faltas diferentes não podem ficar com reposição marcada pro mesmo
      // data+hora — é o mesmo paciente, não pode estar em duas sessões ao mesmo
      // tempo. A escolha manual (ao contrário da sugestão automática) não passava
      // por essa checagem, então clicar numa opção que colidia com a de outra
      // falta deixava as duas marcadas ao mesmo tempo. Escolher esta aqui desmarca
      // qualquer outra falta que já estivesse usando exatamente esse horário — ela
      // volta a ficar pendente, o coordenador escolhe outro horário pra ela.
      if (candidato) {
        comSugestao.forEach(r => {
          if (r.falta.faltaId === faltaId || !next.has(r.falta.faltaId)) return
          const outraSug = r.sugestoes[escolhas[r.falta.faltaId] ?? 0]
          if (outraSug && outraSug.data === candidato.data && outraSug.hora === candidato.hora) {
            next.delete(r.falta.faltaId)
          }
        })
      }
      return next
    })
  }

  function selecionarTudo() {
    setSelecionados(new Set(comSugestao.map(r => r.falta.faltaId)))
  }

  function limparSelecao() {
    setSelecionados(new Set())
  }

  // Botão "Sugestão automática": recalcula do zero com a mesma função usada no
  // estado inicial (calcularSugestaoAutomatica) — útil pra voltar ao melhor lote
  // calculado depois de mexer manualmente na seleção.
  function sugestaoAutomatica() {
    const { escolhas: novasEscolhas, selecionados: novosSelecionados } = calcularSugestaoAutomatica(comSugestao, aceites)
    setEscolhas(prev => ({ ...prev, ...novasEscolhas }))
    setSelecionados(novosSelecionados)
  }

  const barraVis = propostasSel.length > 0
  const temSugestoes = comSugestao.length > 0

  return (
    <div style={{ paddingBottom: barraVis ? 96 : 0 }}>
      {/* ── Nome do paciente + Sugestão automática ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: "var(--muted-foreground)",
        }}>
          {pacienteNome}
        </div>
        <button
          type="button"
          className="sugestao-automatica-btn"
          onClick={sugestaoAutomatica}
          disabled={!temSugestoes}
          title="Escolhe uma reposição pra cada falta, priorizando mesmo profissional e evitando intervalo entre sessões no mesmo dia"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 800,
            fontFamily: "inherit",
            cursor: temSugestoes ? "pointer" : "default",
            border: "none",
            background: temSugestoes ? "linear-gradient(135deg, #4f46e5, #7c3aed)" : "#cbd5e1",
            color: "#ffffff",
            boxShadow: temSugestoes ? "0 4px 14px rgba(79,70,229,0.35)" : "none",
            opacity: temSugestoes ? 1 : 0.6,
            animation: temSugestoes ? "sugestaoPulse 2.4s ease-in-out infinite" : "none",
            transition: "transform 0.15s",
          }}
          onMouseEnter={e => { if (temSugestoes) e.currentTarget.style.transform = "scale(1.05)" }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)" }}
        >
          ✨ Sugestão automática
        </button>
        <style>{`
          @keyframes sugestaoPulse {
            0%, 100% { box-shadow: 0 4px 14px rgba(79,70,229,0.35); }
            50%      { box-shadow: 0 4px 22px rgba(124,58,237,0.6); }
          }
          @media (prefers-reduced-motion: reduce) {
            .sugestao-automatica-btn { animation: none !important; }
          }
        `}</style>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ── Grade semanal ── */}
        <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 56 }} />
              {diasAtivos.map(d => <col key={d} />)}
            </colgroup>

            <thead>
              <tr>
                <th style={{ padding: "0 0 14px" }} />
                {diasAtivos.map(dia => (
                  <th
                    key={dia}
                    style={{
                      padding: "0 6px 14px",
                      textAlign: "center",
                      verticalAlign: "bottom",
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                      {DIA_ABR[dia] ?? dia}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginTop: 1 }}>
                      {fmtData(diaToDate[dia])}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {horasAtivas.map(hora => (
                <tr key={hora}>
                  <td
                    style={{
                      padding: "8px 10px 8px 0",
                      fontSize: 12,
                      color: "#94a3b8",
                      fontWeight: 500,
                      verticalAlign: "middle",
                      whiteSpace: "nowrap",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {hora}
                  </td>

                  {diasAtivos.map(dia => {
                    const bucket = grid[hora]?.[dia]
                    const principal = bucket?.principal
                    const extras = bucket?.extras ?? []

                    // Para "proposta", só é "selecionada" a que representa a opção escolhida
                    // atualmente (candidatoIndex bate com escolhas[faltaId]) — as demais
                    // opções (da mesma falta ou de outra) ficam com visual neutro (clicáveis).
                    function isSelecionada(c: CellCard): boolean {
                      if (!c.faltaId) return false
                      if (c.tipo !== "proposta") return selecionados.has(c.faltaId)
                      return selecionados.has(c.faltaId) && (c.candidatoIndex ?? 0) === (escolhas[c.faltaId] ?? 0)
                    }

                    // Marcadores em ordem alfabética pela letra da falta — mais fácil de
                    // escanear um grupo empilhado do que a ordem em que foram calculados.
                    function porLetra(a: CellCard, b: CellCard): number {
                      return (a.label ?? "").localeCompare(b.label ?? "")
                    }

                    function marcador(c: CellCard) {
                      return (
                        <SessionCard
                          key={c.faltaId ? `${c.faltaId}-${c.candidatoIndex}` : undefined}
                          card={c}
                          selected={isSelecionada(c)}
                          compact
                          highlighted={!!c.faltaId && c.faltaId === hoverFaltaId}
                          onToggle={() => c.faltaId && selecionarCandidato(c.faltaId, c.candidatoIndex ?? 0)}
                          onRecusarAceito={() => c.faltaId && onRecusarAceito(c.faltaId)}
                          onHoverEnter={() => c.faltaId && setHoverFaltaId(c.faltaId)}
                          onHoverLeave={() => setHoverFaltaId(null)}
                        />
                      )
                    }

                    // Se o "principal" da célula também é só um marcador (nenhuma opção
                    // escolhida caiu aqui — pass 1 já teria reservado a célula pra ela),
                    // TODOS os candidatos dessa célula (principal + extras) são marcadores
                    // e entram juntos numa única grade compacta, em vez de um "principal"
                    // grande e vazio seguido de extras pequenos desalinhados.
                    const principalEhMarcador = principal?.tipo === "proposta" && !isSelecionada(principal)

                    return (
                      <td
                        key={dia}
                        style={{
                          padding: "5px 4px",
                          verticalAlign: "top",
                          borderBottom: "1px solid #f1f5f9",
                          minWidth: 140,
                        }}
                      >
                        {!principal ? (
                          <EmptyCell />
                        ) : principalEhMarcador ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {[principal, ...extras].sort(porLetra).map(marcador)}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <SessionCard
                              card={principal}
                              selected={isSelecionada(principal)}
                              highlighted={!!principal.faltaId && principal.faltaId === hoverFaltaId}
                              onToggle={() => principal.faltaId && selecionarCandidato(principal.faltaId, principal.candidatoIndex ?? 0)}
                              onRecusarAceito={() => principal.faltaId && onRecusarAceito(principal.faltaId)}
                              onHoverEnter={() => principal.faltaId && setHoverFaltaId(principal.faltaId)}
                              onHoverLeave={() => setHoverFaltaId(null)}
                            />
                            {extras.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {[...extras].sort(porLetra).map(marcador)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Painel de resumo (direita) ── */}
        <PainelResumo
          resultados={resultadosPendentes}
          sessoesAgendadas={sessoesAgendadas}
          selecionados={selecionados}
          escolhas={escolhas}
          faltaLabel={faltaLabel}
          totalPendentes={comSugestao.length}
          onSelecionarTudo={selecionarTudo}
          onLimparSelecao={limparSelecao}
        />
      </div>

      {/* ── Barra de ação (sticky rodapé) ── */}
      {barraVis && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            boxShadow: "0 -4px 24px rgba(15,23,42,0.07)",
            padding: "10px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            zIndex: 50,
          }}
        >
          {/* Indicador */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#f0fdf4",
                border: "2px solid #16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#16a34a",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                {propostasSel.length} alteração(ões) pronta(s) para implantação
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                Revise as propostas selecionadas na grade.
              </div>
            </div>
          </div>

          {/* Chips */}
          <div style={{ flex: 1, display: "flex", gap: 8, overflowX: "auto", padding: "2px 0" }}>
            {propostasSel.map(({ faltaId, sug }) => (
              <PropostaChip
                key={faltaId}
                dia={sug.dia}
                hora={sug.hora}
                terapia={sug.terapiaExibicao || sug.terapia}
              />
            ))}
          </div>

          {/* Botões */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setSelecionados(new Set())}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#475569",
                }}
              >
                Cancelar seleção
              </button>
              <button
                onClick={() => onAceitar(propostasSel.map(({ faltaId, sug }) => ({ faltaId, sugestao: sug })))}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "none",
                  background: "#16a34a",
                  color: "#ffffff",
                }}
              >
                Aceitar alterações ({propostasSel.length})
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>
              As alterações só serão aplicadas após a confirmação.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
