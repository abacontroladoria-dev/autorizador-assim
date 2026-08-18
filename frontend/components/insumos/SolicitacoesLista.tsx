"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ChevronRight, PackagePlus, Search, ShoppingBag, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PrioridadeChip, StatusFilterChips, StatusInsumoChip, TODOS } from "@/components/insumos/chips"
import { STATUS_COMPRA, STATUS_COTACAO, diasParada, estaParada } from "@/lib/insumos/fluxo"
import { nomeCategoria } from "@/lib/insumos/rotulos"
import type { CategoriaCompra, Prioridade, StatusSolicitacaoCompra } from "@/lib/insumos/tipos"
import { listarSolicitacoes, type SolicitacaoLista } from "@/services/insumos.service"
import { fmtNumBR } from "@/lib/remuneracao/formatacao"

// Lista de solicitações de compra. Porta SolicitacoesListPage do AXIUM.
//
// DUAS MUDANÇAS DE ESTRUTURA EM RELAÇÃO AO ORIGINAL:
//
// 1. Lá eram duas rotas (`/logistica/cotacoes` e `/logistica/compras`) renderizando
//    o mesmo componente com `statusPermitidos` diferente. Aqui é uma rota com duas
//    abas, porque STATUS_COTACAO e STATUS_COMPRA são uma PARTIÇÃO dos 12 status —
//    toda solicitação cai em exatamente um dos dois grupos. É o caso que
//    docs/padrao-detalhamento-modal.md §3.3 descreve: aba é partição, e a soma
//    das abas fecha com o todo.
// 2. Cores por token semântico (bg-card, border-border, text-muted-foreground) em
//    vez de bg-white/slate-*. O app tem tema escuro e superfície branca cravada
//    o quebra — foi o mesmo defeito auditado na TV de chamada.

type Aba = "cotacoes" | "compras"

const ABAS: { id: Aba; rotulo: string; icone: typeof Search; statusPermitidos: StatusSolicitacaoCompra[] }[] = [
  { id: "cotacoes", rotulo: "Cotações", icone: Search, statusPermitidos: STATUS_COTACAO },
  { id: "compras", rotulo: "Compras", icone: ShoppingBag, statusPermitidos: STATUS_COMPRA },
]

export function SolicitacoesLista() {
  const [aba, setAba] = useState<Aba>("cotacoes")
  const [status, setStatus] = useState<string>(TODOS)
  const [dados, setDados] = useState<SolicitacaoLista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Instante da carga, capturado uma vez. "Parada há N dias" tem de ser relativo
  // a QUANDO os dados foram lidos — e ler o relógio durante o render é impuro:
  // o React pode re-renderizar a qualquer momento e o número mudaria sozinho.
  const [lidoEm, setLidoEm] = useState<Date>(() => new Date())

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      // Sem filtro de status na requisição: o filtro é local, para as contagens
      // dos chips e das abas ficarem certas sem um round-trip por chip.
      const linhas = await listarSolicitacoes({ limit: 200 })
      setLidoEm(new Date())
      setDados(linhas)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as solicitações.")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abaAtual = ABAS.find((a) => a.id === aba)!

  // Deduplicação por id: a identidade da solicitação é o id, e uma consulta
  // multiempresa nunca deve mostrar a mesma linha duas vezes ao operador.
  const doBucket = useMemo(() => {
    const unicas = [...new Map(dados.map((s) => [s.id, s])).values()]
    return unicas.filter((s) => abaAtual.statusPermitidos.includes(s.status))
  }, [dados, abaAtual])

  const contagens = useMemo(() => {
    const c: Partial<Record<StatusSolicitacaoCompra, number>> = {}
    for (const s of doBucket) c[s.status] = (c[s.status] ?? 0) + 1
    return c
  }, [doBucket])

  const contagemPorAba = useMemo(() => {
    const unicas = [...new Map(dados.map((s) => [s.id, s])).values()]
    return {
      cotacoes: unicas.filter((s) => STATUS_COTACAO.includes(s.status)).length,
      compras: unicas.filter((s) => STATUS_COMPRA.includes(s.status)).length,
    }
  }, [dados])

  const filtrado = status === TODOS ? doBucket : doBucket.filter((s) => s.status === status)

  function trocarAba(nova: Aba) {
    setAba(nova)
    // O status selecionado pertence à aba anterior — mantê-lo esconderia tudo.
    setStatus(TODOS)
  }

  const tabRefs = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({})

  // Setas move o foco E a seleção entre as duas abas — padrão ARIA APG para
  // tablist. Só tinha clique antes: funcionava por Tab+Enter, mas sem setas
  // não é o comportamento que um leitor de tela anuncia como "tab".
  function aoTeclarNaTablist(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return
    evento.preventDefault()
    const indiceAtual = ABAS.findIndex((a) => a.id === aba)
    const proxima =
      evento.key === "ArrowRight"
        ? ABAS[(indiceAtual + 1) % ABAS.length]
        : ABAS[(indiceAtual - 1 + ABAS.length) % ABAS.length]
    trocarAba(proxima.id)
    tabRefs.current[proxima.id]?.focus()
  }

  return (
    // gap-5 aqui, mais apertado dentro do painel (ver abaixo): o corte entre
    // abas troca o CONJUNTO de dados (partição de fluxo.ts); os chips de
    // status só refinam a vista de um conjunto já escolhido, então ficam mais
    // colados à tabela que governam do que à trilha de abas acima
    // (/impeccable layout 2026-08-18).
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Uma esteira só, cortada em dois — não dois botões soltos. STATUS_COTACAO e
            STATUS_COMPRA são partição dos 12 status (lib/insumos/fluxo.ts), e o rail
            faz essa partição ser vista: um trilho contínuo com o indicador deslizando
            de um lado para o outro, nunca dois blocos independentes. */}
        <div
          className="relative grid grid-cols-2 rounded-xl bg-muted/60 p-1 text-sm font-semibold"
          role="tablist"
          onKeyDown={aoTeclarNaTablist}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 w-[calc(50%-0.125rem)] rounded-lg bg-card shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: aba === "compras" ? "translateX(calc(100% + 0.25rem))" : "translateX(0)" }}
          />
          {ABAS.map((a) => {
            const Icone = a.icone
            const ativa = aba === a.id
            return (
              <button
                key={a.id}
                ref={(el) => {
                  tabRefs.current[a.id] = el
                }}
                id={`insumos-tab-${a.id}`}
                type="button"
                role="tab"
                aria-selected={ativa}
                aria-controls={`insumos-painel-${a.id}`}
                tabIndex={ativa ? 0 : -1}
                onClick={() => trocarAba(a.id)}
                className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  ativa ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icone className="size-3.5" strokeWidth={2.25} />
                {a.rotulo}
                <span className="tabular-nums text-xs opacity-70">{contagemPorAba[a.id]}</span>
              </button>
            )
          })}
        </div>

        <Button asChild size="sm">
          <Link href="/insumos/nova">
            <PackagePlus className="size-4" />
            Nova solicitação
          </Link>
        </Button>
      </div>

      <div
        id={`insumos-painel-${aba}`}
        role="tabpanel"
        aria-labelledby={`insumos-tab-${aba}`}
        tabIndex={0}
        className="flex flex-col gap-3"
      >
        <StatusFilterChips
          statusPermitidos={abaAtual.statusPermitidos}
          contagens={contagens}
          total={doBucket.length}
          ativo={status}
          onSelecionar={setStatus}
        />

        {erro && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <span>{erro}</span>
              <button type="button" onClick={() => void carregar()} className="w-fit font-semibold underline">
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        <div className="scroll-fade-x overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                {["Solicitado em", "Solicitante", "Empresa", "Prioridade", "Item", "Categoria", "Qtd.", "Status"].map(
                  (rotulo) => (
                    <th key={rotulo} className="px-4 py-3 text-left">
                      <span className="text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                        {rotulo}
                      </span>
                    </th>
                  )
                )}
                {/* Sticky: numa tabela de 9 colunas dentro de overflow-x-auto, a
                    ação de abrir a linha é a única coisa que não pode ficar
                    presa fora da tela em viewport estreito (audit 2026-08-18). */}
                <th className="sticky right-0 w-10 bg-card px-2" aria-hidden="true" />
              </tr>
            </thead>

            <tbody>
              {carregando && <LinhasEsqueleto />}

              {!carregando && filtrado.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma solicitação {status === TODOS ? "nesta aba" : "com este status"}.
                  </td>
                </tr>
              )}

              {!carregando &&
                filtrado.map((s) => (
                  <LinhaSolicitacao key={s.id} solicitacao={s} lidoEm={lidoEm} />
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LinhaSolicitacao({
  solicitacao: s,
  lidoEm,
}: {
  solicitacao: SolicitacaoLista
  lidoEm: Date
}) {
  const parada = estaParada({ status: s.status, atualizado_em: s.atualizado_em }, lidoEm)
  const dias = diasParada(s.atualizado_em, lidoEm)

  return (
    <tr className="border-b border-border/60 last:border-0 transition hover:bg-muted/40">
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
        {new Date(s.data_solicitacao).toLocaleDateString("pt-BR")}
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span>{s.solicitante_externo_nome ?? s.solicitante?.nome ?? "—"}</span>
          {/* Quem pediu pelo link público não tem conta no sistema; sem esta marca
              a linha parece ter sido criada pelo usuário-sistema da empresa. */}
          {s.solicitante_externo_nome && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              link externo
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 whitespace-nowrap">{s.empresa?.nome_fantasia ?? "—"}</td>

      <td className="px-4 py-3">
        <PrioridadeChip prioridade={s.prioridade as Prioridade} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{s.nome_item}</span>
          {/* Parada há 3+ dias: aviso na linha, não numa tela de relatório que
              ninguém abre. O cálculo usa atualizado_em como proxy — ver
              lib/insumos/fluxo.ts. */}
          {parada && (
            <span
              title={`Sem movimentação há ${dias} dias`}
              className="inline-flex items-center text-amber-600"
            >
              <TriangleAlert className="size-3.5" />
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {nomeCategoria(s.categoria as CategoriaCompra, s.categoria_outro)}
      </td>

      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
        {fmtNumBR(Number(s.quantidade), 0)} {s.unidade_medida}
      </td>

      <td className="px-4 py-3">
        <StatusInsumoChip status={s.status} />
      </td>

      <td className="sticky right-0 border-l border-border/60 bg-card px-2 py-3">
        {/* O link é na célula, não na <tr>: linha inteira clicável com role=button
            (como no AXIUM) não é alcançável por teclado nem abre em nova aba.
            Sticky para não ficar preso fora da tela — ver o <th> irmão. */}
        <Link
          href={`/insumos/${s.id}`}
          aria-label={`Abrir solicitação de ${s.nome_item}`}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      </td>
    </tr>
  )
}

function LinhasEsqueleto() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-border/60 last:border-0">
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-muted" />
            </td>
          ))}
          <td className="sticky right-0 bg-card px-2 py-3" />
        </tr>
      ))}
    </>
  )
}
