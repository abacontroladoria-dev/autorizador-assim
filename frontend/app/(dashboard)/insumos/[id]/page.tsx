"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, ClipboardList, Clock3, Gavel, History, Search, ShoppingCart, TriangleAlert } from "lucide-react"
import toast from "react-hot-toast"
import { useHeader } from "@/contexts/HeaderContext"
import { Button } from "@/components/ui/button"
import { PrioridadeChip, StatusInsumoChip } from "@/components/insumos/chips"
import { Secao } from "@/components/insumos/campos"
import { SolicitacaoForm, type SolicitacaoFormValues } from "@/components/insumos/SolicitacaoForm"
import { CotacoesTable } from "@/components/insumos/CotacoesTable"
import { CotacaoManualForm } from "@/components/insumos/CotacaoManualForm"
import { AprovacaoPanel } from "@/components/insumos/AprovacaoPanel"
import { RegistrarCompraForm } from "@/components/insumos/RegistrarCompraForm"
import { HistoricoTimeline } from "@/components/insumos/HistoricoTimeline"
import { nomeCategoria } from "@/lib/insumos/rotulos"
import {
  podeCotarManualmente,
  podeConfirmarEntrega,
  podeDecidirAprovacao,
  podeEditar,
  podePausar,
  podeRegistrarCompra,
  podeRetomar,
} from "@/lib/insumos/fluxo"
import { fmtNumBR } from "@/lib/remuneracao/formatacao"
import {
  atualizarSolicitacao,
  buscarSolicitacao,
  confirmarEntrega,
  criarCotacaoManual,
  decidirAprovacao,
  pausarSolicitacao,
  registrarCompra,
  reenviarParaCotacao,
  retomarSolicitacao,
  type SolicitacaoDetalhe,
} from "@/services/insumos.service"

// Tela central do módulo: cotações, histórico, decisão de aprovação e compra.
// Porta SolicitacaoDetalhePage.tsx do AXIUM — a maior peça que faltava (só a
// lista e o formulário de criação tinham sido portados até aqui, ver
// docs/AXIUM_MIGRACAO.md fase 5). Sem esta página, todo clique numa linha da
// lista ou toda criação de solicitação caía em 404.
//
// Diferença de leitura em relação ao AXIUM: lá a API devolvia camelCase
// (Nest/Prisma); aqui `buscarSolicitacao` devolve as colunas cruas do Supabase,
// em snake_case — só as ESCRITAS (editar, cotar manualmente, decidir, comprar)
// continuam em camelCase, porque são o shape que os DTOs do servidor
// (modules/insumos/dto/) exigem.

function VoltarParaLista() {
  return (
    <Link
      href="/insumos"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar
    </Link>
  )
}

/**
 * Esqueleto, não spinner — regra do PRODUCT.md ("Skeleton states for loading,
 * not spinners in the middle of content") e paridade com a lista, que já usa
 * LinhasEsqueleto. Um clique que sai de uma tela com esqueleto e cai numa com
 * spinner é duas linguagens de carregamento para a mesma navegação.
 */
function DetalheEsqueleto() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-7 w-20 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function formatarDuracao(inicioIso: string, fimIso?: string | null): string {
  const ms = Math.max(0, new Date(fimIso ?? Date.now()).getTime() - new Date(inicioIso).getTime())
  const segundos = Math.floor(ms / 1000)
  if (segundos < 60) return `${segundos} s`
  const minutos = Math.floor(segundos / 60)
  const segundosRestantes = segundos % 60
  if (minutos < 60) return `${minutos} min ${segundosRestantes} s`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${minutos % 60} min`
}

function paraValoresFormulario(s: SolicitacaoDetalhe): Partial<SolicitacaoFormValues> {
  return {
    categoria: s.categoria as SolicitacaoFormValues["categoria"],
    categoriaOutro: s.categoria_outro ?? undefined,
    prioridade: s.prioridade as SolicitacaoFormValues["prioridade"],
    justificativaCompra: s.justificativa_compra,
    nomeItem: s.nome_item,
    descricaoDetalhada: s.descricao_detalhada,
    quantidade: Number(s.quantidade),
    unidadeMedida: s.unidade_medida,
    marcaDesejada: s.marca_desejada ?? undefined,
    modeloDesejado: s.modelo_desejado ?? undefined,
    cor: s.cor ?? undefined,
    tamanhoMedidaCapacidade: s.tamanho_medida_capacidade ?? undefined,
    material: s.material ?? undefined,
    linkReferencia: s.link_referencia ?? undefined,
    marketplacePermitido: s.marketplace_permitido ?? "Mercado Livre",
    prazoMaximoEntregaDias: s.prazo_maximo_entrega_dias ?? 7,
  }
}

export default function SolicitacaoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const { setHeader, setRightContent } = useHeader()

  const [solicitacao, setSolicitacao] = useState<SolicitacaoDetalhe | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [executandoAcao, setExecutandoAcao] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const dados = await buscarSolicitacao(id)
      setSolicitacao(dados)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a solicitação.")
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    setRightContent(<VoltarParaLista />)
    return () => setRightContent(null)
  }, [setRightContent])

  useEffect(() => {
    setHeader(solicitacao?.nome_item ?? "Solicitação", "Cotações, histórico, aprovação e compra")
    return () => setHeader("", "")
  }, [setHeader, solicitacao?.nome_item])

  const jobAtual = solicitacao?.jobs[0] ?? null
  const jobEmProcessamento = jobAtual?.status === "PENDENTE" || jobAtual?.status === "PROCESSANDO"
  const cotacaoEmProcessamento =
    solicitacao?.status === "SOLICITACAO_CRIADA" || solicitacao?.status === "COTACAO_EM_ANDAMENTO" || jobEmProcessamento

  // A cotação é assíncrona: enquanto o worker trabalha, atualiza só esta
  // solicitação, sem o operador precisar recarregar a página.
  useEffect(() => {
    if (!cotacaoEmProcessamento) return
    const timer = window.setInterval(() => void carregar(), 5000)
    return () => window.clearInterval(timer)
  }, [cotacaoEmProcessamento, carregar])

  async function acao(fn: () => Promise<unknown>) {
    setErroAcao(null)
    setExecutandoAcao(true)
    try {
      await fn()
      await carregar()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Não foi possível executar esta ação. Tente novamente.")
    } finally {
      setExecutandoAcao(false)
    }
  }

  if (carregando) {
    return <DetalheEsqueleto />
  }

  if (erro || !solicitacao) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
      >
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{erro ?? "Solicitação não encontrada."}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Sem distinguir 404 real de falha transitória de rede no cliente
              (o erro chega como texto puro, não como tipo) — oferecer os dois
              caminhos custa pouco e cobre o caso comum: tentar de novo resolve
              um blip de rede, e quem seguiu link morto ainda tem a saída. */}
          <button type="button" onClick={() => void carregar()} className="font-semibold underline">
            Tentar novamente
          </button>
          <Link href="/insumos" className="font-semibold underline">
            Voltar para a lista
          </Link>
        </div>
      </div>
    )
  }

  const cotacaoSelecionada = solicitacao.cotacoes.find((c) => c.selecionada) ?? null

  return (
    // Sem max-w aqui, ao contrário do formulário de criação: a tabela de
    // cotações tem 8 colunas e precisa da largura cheia da página. O
    // SolicitacaoForm de edição já se auto-limita a max-w-3xl por dentro.
    //
    // gap-6: mesmo tier "cartão a cartão" do SolicitacaoForm — Detalhes,
    // Cotações, Decisão de aprovação, Registrar compra e Histórico são
    // seções distintas, não uma pilha uniforme (/impeccable layout 2026-08-18).
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusInsumoChip status={solicitacao.status} />
          <PrioridadeChip prioridade={solicitacao.prioridade as SolicitacaoFormValues["prioridade"]} />
        </div>

        <div className="flex flex-wrap gap-2">
          {podeEditar(solicitacao.status) && (
            <Button variant="outline" size="sm" onClick={() => setEditando((v) => !v)}>
              {editando ? "Cancelar edição" : "Editar"}
            </Button>
          )}
          {podePausar(solicitacao.status) && (
            <Button
              variant="outline"
              size="sm"
              disabled={executandoAcao}
              onClick={() => void acao(() => pausarSolicitacao(solicitacao.id))}
            >
              Pausar
            </Button>
          )}
          {podeRetomar(solicitacao.status) && (
            <Button
              variant="outline"
              size="sm"
              disabled={executandoAcao}
              onClick={() => void acao(() => retomarSolicitacao(solicitacao.id))}
            >
              Retomar
            </Button>
          )}
          {podeConfirmarEntrega(solicitacao.status) && (
            <Button size="sm" disabled={executandoAcao} onClick={() => void acao(() => confirmarEntrega(solicitacao.id))}>
              Confirmar entrega
            </Button>
          )}
        </div>
      </div>

      {erroAcao && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{erroAcao}</span>
        </div>
      )}

      {editando ? (
        <SolicitacaoForm
          incluirSetor={false}
          incluirEmpresa={false}
          rotuloEnviar="Salvar alterações"
          valoresIniciais={paraValoresFormulario(solicitacao)}
          onEnviar={async (valores) => {
            await atualizarSolicitacao(solicitacao.id, valores)
            setEditando(false)
            await carregar()
            toast.success("Solicitação atualizada.")
          }}
        />
      ) : (
        <Secao titulo="Detalhes" icone={ClipboardList}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Solicitante</dt>
              <dd className="text-sm text-foreground">
                {solicitacao.solicitante_externo_nome ?? solicitacao.solicitante?.nome ?? "—"}
                {solicitacao.solicitante_externo_nome && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    · via link externo · {solicitacao.solicitante_externo_email}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Empresa</dt>
              <dd className="text-sm text-foreground">{solicitacao.empresa?.nome_fantasia ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Setor</dt>
              <dd className="text-sm text-foreground">{solicitacao.setor}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Categoria</dt>
              <dd className="text-sm text-foreground">
                {nomeCategoria(solicitacao.categoria as SolicitacaoFormValues["categoria"], solicitacao.categoria_outro)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Quantidade</dt>
              <dd className="text-sm tabular-nums text-foreground">
                {fmtNumBR(Number(solicitacao.quantidade), 0)} {solicitacao.unidade_medida}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Data da solicitação</dt>
              <dd className="text-sm tabular-nums text-foreground">
                {new Date(solicitacao.data_solicitacao).toLocaleDateString("pt-BR")}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Prazo máximo de entrega</dt>
              <dd className="text-sm text-foreground">Em até {solicitacao.prazo_maximo_entrega_dias ?? 7} dias</dd>
            </div>
          </dl>
          <p className="text-sm text-foreground">{solicitacao.descricao_detalhada}</p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Justificativa:</strong> {solicitacao.justificativa_compra}
          </p>
        </Secao>
      )}

      <Secao titulo="Cotações" icone={Search}>
        {jobAtual && (
          <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <strong className="text-foreground">
                {jobAtual.status === "PENDENTE" && "Aguardando início da pesquisa"}
                {jobAtual.status === "PROCESSANDO" && "Pesquisa em andamento"}
                {jobAtual.status === "CONCLUIDO" && "Cotação concluída"}
                {jobAtual.status === "FALHOU" && "A cotação falhou"}
              </strong>
              <span className="text-muted-foreground">
                {jobAtual.status === "PENDENTE" && `Na fila há ${formatarDuracao(jobAtual.criado_em)}`}
                {jobAtual.status === "PROCESSANDO" &&
                  jobAtual.iniciado_em &&
                  `Pesquisando há ${formatarDuracao(jobAtual.iniciado_em)} · Espera na fila: ${formatarDuracao(jobAtual.criado_em, jobAtual.iniciado_em)}`}
                {(jobAtual.status === "CONCLUIDO" || jobAtual.status === "FALHOU") &&
                  jobAtual.iniciado_em &&
                  jobAtual.concluido_em &&
                  `Tempo da pesquisa: ${formatarDuracao(jobAtual.iniciado_em, jobAtual.concluido_em)} · Tempo total: ${formatarDuracao(jobAtual.criado_em, jobAtual.concluido_em)}`}
              </span>
            </div>
          </div>
        )}

        {cotacaoEmProcessamento && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
            {solicitacao.status === "SOLICITACAO_CRIADA"
              ? "Na fila de cotação. A página será atualizada automaticamente."
              : "Pesquisando e avaliando ofertas automaticamente…"}
          </div>
        )}

        {jobAtual?.status === "FALHOU" && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
          >
            <div className="flex flex-col">
              <strong>A cotação automática falhou.</strong>
              <span>{jobAtual.erro ?? "Não foi possível concluir a pesquisa."}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={executandoAcao}
              onClick={() => void acao(() => reenviarParaCotacao(solicitacao.id))}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        <CotacoesTable cotacoes={solicitacao.cotacoes} />

        {podeCotarManualmente(solicitacao.status) && (
          <CotacaoManualForm
            onSubmit={async (input) => {
              await criarCotacaoManual(solicitacao.id, input)
              await carregar()
            }}
          />
        )}
      </Secao>

      {podeDecidirAprovacao(solicitacao.status) && (
        <Secao titulo="Decisão de aprovação" icone={Gavel}>
          <AprovacaoPanel
            cotacoes={solicitacao.cotacoes}
            onSubmit={async (input) => {
              await decidirAprovacao(solicitacao.id, input)
              await carregar()
            }}
          />
        </Secao>
      )}

      {podeRegistrarCompra(solicitacao.status) && (
        <Secao titulo="Registrar compra" icone={ShoppingCart}>
          <RegistrarCompraForm
            cotacaoSelecionada={cotacaoSelecionada}
            onSubmit={async (input) => {
              await registrarCompra(solicitacao.id, input)
              await carregar()
            }}
          />
        </Secao>
      )}

      <Secao titulo="Histórico" icone={History}>
        <HistoricoTimeline historico={solicitacao.historico} />
      </Secao>
    </div>
  )
}
