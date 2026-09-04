"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, AlertOctagon, ClockAlert, Hourglass, PlayCircle, UserRound, UserX, Users } from "lucide-react"
import type { ItemPdi } from "@/lib/pdi/filtros"
import type { MetaPdiPrazos } from "@/types/pdiPrazos"
import {
  agruparPorAnalista,
  calcularResumoExecutivo,
  calcularSemaforo,
  filtrarAtivosComAutorizacaoAba,
  type LinhaAnalista,
  type Semaforo,
} from "@/lib/pdi/painelAnalista"
import { AnalistaDetalheModal } from "./AnalistaDetalheModal"
import { PdiDetalheModal } from "./PdiDetalheModal"

// "PDI - Painel por Analista" — dashboard por Coordenador de Caso ("Analista",
// no jargão da clínica), pedido do usuário (04/09/2026), espelhando a aba
// "Dashboard" da planilha Excel original (`Controle_Prazos_PDI pronto 2.0`).
//
// MOLDE de PdiPrazosShell.tsx: mesmo fetch de /api/pdi-controle-prazos/, mesmo
// tratamento de erro/loading — mas SEM filtro/paginação: é um painel de
// leitura, não uma fila de trabalho. A agregação (`agruparPorAnalista`,
// `calcularResumoExecutivo`, `calcularSemaforo`) é toda em lib/pdi/painelAnalista.ts,
// puro e testado — este componente só busca, calcula com `useMemo` e renderiza.
//
// ─── Decisões desta tela ──────────────────────────────────────────────────
//
// A população do painel INTEIRO é `filtrarAtivosComAutorizacaoAba(itens)`
// (pedido do usuário, 05/09/2026), não `itens` cru — ver o cabeçalho de
// lib/pdi/painelAnalista.ts. "Total com Autorização ABA" só conta quem tem
// autorização HOJE (elegível pelo relatório) E está ativo (sessão agendada na
// 1ª semana do mês seguinte); os outros números do painel (Atrasados,
// Próximo do Prazo, etc.) usam a MESMA população, senão o "Total" não bateria
// com a soma dos outros cards.
//
// "Resumo Geral" (tabela Categoria/Quantidade da planilha original) foi
// REMOVIDO (pedido do usuário, 05/09/2026): é a mesma informação do Painel
// Executivo acima, em outro formato — redundante de verdade, ao contrário do
// resto da estrutura da planilha que fazia sentido replicar.
//
// "PDIs por Coordenador" virou CARDS, não tabela (pedido do usuário,
// 05/09/2026: a tabela "parecia planilha de Excel") — ver `CardAnalista`
// abaixo.
//
// "Sem Coordenador de Caso": `agruparPorAnalista` só itera coordenadores
// existentes (ver o cabeçalho de lib/pdi/painelAnalista.ts), então a
// responsabilidade de não deixar esses pacientes desaparecerem da tabela por
// analista é DESTE componente — `linhaSemCoordenador` abaixo soma por status
// os itens com `coordenadores.length === 0`, viram uma linha extra ao fim da
// tabela "PDIs por Coordenador".

const SEMAFORO_INFO: Record<Semaforo, { rotulo: string; cor: string; anel: string }> = {
  verde: {
    rotulo: "VERDE",
    cor: "text-emerald-600 dark:text-emerald-400",
    anel: "border-emerald-400 bg-emerald-500/10",
  },
  amarelo: {
    rotulo: "AMARELO",
    cor: "text-amber-600 dark:text-amber-400",
    anel: "border-amber-400 bg-amber-500/10",
  },
  vermelho: {
    rotulo: "VERMELHO",
    cor: "text-rose-600 dark:text-rose-400",
    anel: "border-rose-400 bg-rose-500/10",
  },
}

type CardExecutivoInfo = {
  chave: "totalPacientes" | "atrasados" | "proximoPrazo" | "emAndamento" | "aguardandoImplementacao"
  rotulo: string
  icone: typeof Users
  tom: string
  base: string
}

const CARDS_EXECUTIVO: CardExecutivoInfo[] = [
  {
    chave: "totalPacientes",
    rotulo: "Ativos com Autorização ABA",
    icone: Users,
    tom: "text-slate-600 dark:text-slate-300",
    base: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40",
  },
  {
    chave: "atrasados",
    rotulo: "Total de PDIs Atrasados",
    icone: AlertOctagon,
    tom: "text-rose-600 dark:text-rose-400",
    base: "border-rose-100 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
  },
  {
    chave: "proximoPrazo",
    rotulo: "Total Próximos do Prazo",
    icone: ClockAlert,
    tom: "text-amber-600 dark:text-amber-400",
    base: "border-amber-100 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
  },
  {
    chave: "emAndamento",
    rotulo: "Total Dentro do Prazo",
    icone: PlayCircle,
    tom: "text-emerald-600 dark:text-emerald-400",
    base: "border-emerald-100 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
  },
  {
    chave: "aguardandoImplementacao",
    rotulo: "Total Aguardando Implementação",
    icone: Hourglass,
    tom: "text-sky-600 dark:text-sky-400",
    base: "border-sky-100 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30",
  },
]

/** Soma os pacientes SEM Coordenador de Caso por status — vira a linha extra da tabela, ver o cabeçalho. */
function linhaSemCoordenador(itens: ItemPdi[]): LinhaAnalista {
  const linha: LinhaAnalista = {
    profissionalId: 0,
    nome: "Sem Coordenador de Caso",
    atrasados: 0,
    proximoPrazo: 0,
    emAndamento: 0,
    aguardandoImplementacao: 0,
    total: 0,
  }
  for (const item of itens) {
    if (item.coordenadores.length > 0) continue
    linha.total += 1
    if (item.status === "Atrasado") linha.atrasados += 1
    else if (item.status === "Próximo do prazo") linha.proximoPrazo += 1
    else if (item.status === "Dentro do prazo") linha.emAndamento += 1
    else if (item.status === "Aguardando Implementação") linha.aguardandoImplementacao += 1
  }
  return linha
}

export function PainelAnalistaShell() {
  const [itens, setItens] = useState<ItemPdi[]>([])
  const [meta, setMeta] = useState<MetaPdiPrazos | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true)
      setErro(null)
      try {
        const resposta = await fetch("/api/pdi-controle-prazos/", { cache: "no-store" })
        const corpo = await resposta.json()
        if (!resposta.ok || !corpo?.ok) {
          throw new Error(corpo?.error ?? `HTTP ${resposta.status}`)
        }
        if (!ativo) return
        setItens(corpo.itens as ItemPdi[])
        setMeta(corpo.meta as MetaPdiPrazos)
      } catch (e) {
        console.error("[pdi-painel-analista] falha ao carregar", e)
        if (ativo) setErro(e instanceof Error ? e.message : "erro desconhecido")
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    void carregar()
    return () => {
      ativo = false
    }
  }, [])

  // A população do painel inteiro: elegível (autorização ABA hoje) E ativo
  // (sessão agendada na 1ª semana do mês seguinte) — ver o cabeçalho de
  // lib/pdi/painelAnalista.ts::filtrarAtivosComAutorizacaoAba. Todo cálculo
  // abaixo (Painel Executivo, Semáforo, PDIs por Coordenador, e o drill-down
  // por analista) opera sobre ESTA lista, não sobre `itens` cru — os números
  // batem entre si de propósito.
  const itensPainel = useMemo(() => filtrarAtivosComAutorizacaoAba(itens), [itens])

  const resumo = useMemo(() => calcularResumoExecutivo(itensPainel), [itensPainel])
  const semaforo = useMemo(() => calcularSemaforo(resumo.atrasados), [resumo.atrasados])
  const porAnalista = useMemo(() => agruparPorAnalista(itensPainel), [itensPainel])
  const semCoordenador = useMemo(() => linhaSemCoordenador(itensPainel), [itensPainel])

  const infoSemaforo = SEMAFORO_INFO[semaforo]

  const linhas: LinhaAnalista[] = semCoordenador.total > 0 ? [...porAnalista, semCoordenador] : porAnalista

  // Clicar num CardAnalista abre a lista de pacientes daquele analista; clicar
  // num paciente ali dentro abre o PdiDetalheModal de verdade (o mesmo de
  // Controle de Prazos) por cima, fechando a lista — pedido do usuário
  // (05/09/2026): "poderei ver o nome dos pacientes e quem está em cada
  // categoria".
  const [analistaAberto, setAnalistaAberto] = useState<LinhaAnalista | null>(null)
  const [pacienteAberto, setPacienteAberto] = useState<ItemPdi | null>(null)

  const itensDoAnalista = useMemo(() => {
    if (!analistaAberto) return []
    if (analistaAberto.profissionalId === 0) {
      return itensPainel.filter((i) => i.coordenadores.length === 0)
    }
    return itensPainel.filter((i) => i.coordenadores.some((c) => c.profissionalId === analistaAberto.profissionalId))
  }, [analistaAberto, itensPainel])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Não foi possível carregar o Painel por Analista. {erro}
            {" — o robô do Órbita pode não ter rodado hoje."}
          </span>
        </div>
      )}

      {/* Indicador Geral (Semáforo) — fórmula 1:1 da planilha: 0 atrasados =
          verde, 1-5 = amarelo, >5 = vermelho (ver calcularSemaforo). */}
      <div
        className={`flex flex-wrap items-center gap-4 rounded-2xl border-2 px-5 py-4 shadow-sm ${infoSemaforo.anel}`}
      >
        <span className={`text-sm font-bold uppercase tracking-widest ${infoSemaforo.cor}`}>
          Indicador Geral
        </span>
        <span className={`rounded-full border-2 px-4 py-1 text-lg font-extrabold tracking-wide ${infoSemaforo.cor} ${infoSemaforo.anel}`}>
          {carregando ? "—" : infoSemaforo.rotulo}
        </span>
        <span className="text-sm text-muted-foreground">
          {carregando ? "Carregando…" : `${resumo.atrasados} PDI(s) atrasado(s) no total`}
        </span>
      </div>

      {/* PAINEL EXECUTIVO — só leitura, sem onClick/seleção de recorte (ao
          contrário dos KPIs de Controle de Prazos, que também são filtro). */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Painel executivo">
        {CARDS_EXECUTIVO.map((card) => {
          const Icone = card.icone
          return (
            <div
              key={card.chave}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-4 py-4 text-center shadow-sm ${card.base}`}
            >
              <Icone className={`h-5 w-5 ${card.tom}`} aria-hidden="true" />
              <span className={`text-3xl font-bold leading-none ${card.tom}`}>
                {carregando ? "—" : resumo[card.chave]}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">{card.rotulo}</span>
            </div>
          )
        })}
      </section>

      {/* PDIs por Coordenador — cards, não tabela (pedido do usuário,
          05/09/2026: a tabela "parecia planilha de Excel"). Mesmo vocabulário
          visual do resto da feature: cartão arredondado com sombra, hover
          levanta (ver CardPdi.tsx/KpisPdi em FiltrosPdi.tsx) — o Total salta
          aos olhos como número grande, os status viram selos coloridos
          compactos (só aparecem quando > 0, pra não poluir quem tem tudo
          zerado), e Atrasados > 0 destaca a borda inteira do cartão em rose —
          é o mesmo tratamento que "Sem Coordenador de Caso" merece atenção
          (borda tracejada + ícone) em vez de escondido no fim de uma tabela. */}
      <section aria-label="PDIs por Coordenador">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          PDIs por Coordenador
        </h2>
        {carregando ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-8 w-1/3 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-5 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : linhas.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum paciente no Controle de Prazos do PDI.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {linhas.map((linha) => (
              <CardAnalista key={linha.profissionalId} linha={linha} onAbrir={() => setAnalistaAberto(linha)} />
            ))}
          </ul>
        )}
      </section>

      {meta && (
        <p className="text-xs text-muted-foreground">
          Relatório <span className="font-semibold">{meta.arquivoNome}</span> ·{" "}
          {meta.linhasLidas} linhas lidas → {meta.itens} elegíveis · calculado em{" "}
          {meta.hoje.split("-").reverse().join("/")}
        </p>
      )}

      {analistaAberto && (
        <AnalistaDetalheModal
          analistaNome={analistaAberto.nome}
          itens={itensDoAnalista}
          onFechar={() => setAnalistaAberto(null)}
          onAbrirPaciente={(item) => {
            setPacienteAberto(item)
            setAnalistaAberto(null)
          }}
        />
      )}

      {pacienteAberto && meta && (
        <PdiDetalheModal
          item={pacienteAberto}
          hoje={meta.hoje}
          onFechar={() => setPacienteAberto(null)}
          onSalvo={(atualizado) => {
            setItens((atuais) => atuais.map((i) => (i.pacienteId === atualizado.pacienteId ? atualizado : i)))
            setPacienteAberto(null)
          }}
        />
      )}
    </div>
  )
}

/** Um selo de status pequeno — só aparece quando `valor > 0` (ver `CardAnalista`), pra não poluir quem tem tudo zerado. */
function SeloStatus({
  valor,
  rotuloSingular,
  rotuloPlural,
  tom,
}: {
  valor: number
  rotuloSingular: string
  rotuloPlural: string
  tom: "rose" | "amber" | "emerald" | "sky"
}) {
  const TONS: Record<typeof tom, string> = {
    rose: "border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-800 dark:text-rose-400",
    amber: "border-amber-300 bg-amber-500/10 text-amber-700 dark:border-amber-800 dark:text-amber-400",
    emerald: "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
    sky: "border-sky-300 bg-sky-500/10 text-sky-700 dark:border-sky-800 dark:text-sky-400",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONS[tom]}`}>
      {valor} {valor === 1 ? rotuloSingular : rotuloPlural}
    </span>
  )
}

/**
 * Um Coordenador de Caso (Analista) e a contagem de PDIs sob sua
 * responsabilidade, hoje. Substitui a linha de tabela original — pedido do
 * usuário (05/09/2026): mais visual, no mesmo vocabulário de cartão do resto
 * da feature (`CardPdi.tsx`, `KpisPdi` em `FiltrosPdi.tsx`).
 */
function CardAnalista({ linha, onAbrir }: { linha: LinhaAnalista; onAbrir: () => void }) {
  const semCoordenador = linha.profissionalId === 0
  const temAtraso = linha.atrasados > 0

  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver pacientes de ${linha.nome}`}
        className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none ${
          temAtraso
            ? "border-rose-300 bg-rose-500/5 dark:border-rose-800"
            : semCoordenador
              ? "border-dashed border-border bg-muted/20"
              : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          {semCoordenador ? (
            <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          ) : (
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <h3 className="truncate text-sm font-bold text-foreground" title={linha.nome}>
            {linha.nome}
          </h3>
        </div>

        <p className="leading-none">
          <span className="text-3xl font-extrabold tabular-nums text-foreground">{linha.total}</span>{" "}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {linha.total === 1 ? "paciente" : "pacientes"}
          </span>
        </p>

        <div className="flex flex-wrap gap-1.5">
          {linha.atrasados > 0 && (
            <SeloStatus valor={linha.atrasados} rotuloSingular="atrasado" rotuloPlural="atrasados" tom="rose" />
          )}
          {linha.proximoPrazo > 0 && (
            <SeloStatus valor={linha.proximoPrazo} rotuloSingular="próximo" rotuloPlural="próximos" tom="amber" />
          )}
          {linha.emAndamento > 0 && (
            <SeloStatus valor={linha.emAndamento} rotuloSingular="dentro do prazo" rotuloPlural="dentro do prazo" tom="emerald" />
          )}
          {linha.aguardandoImplementacao > 0 && (
            <SeloStatus
              valor={linha.aguardandoImplementacao}
              rotuloSingular="aguardando"
              rotuloPlural="aguardando"
              tom="sky"
            />
          )}
        </div>
      </button>
    </li>
  )
}
