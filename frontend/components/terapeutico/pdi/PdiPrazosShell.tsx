"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, History, Search, X } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { HistoricoCadastrosModal } from "@/components/cadastros/historico/HistoricoCadastrosModal"
import { campo, foco } from "@/components/cadastros/pacientes/ui/campos"
import { aplicar, contarKpis, filtrosIniciais, type FiltrosPdi, type ItemPdi } from "@/lib/pdi/filtros"
import type { MetaPdiPrazos } from "@/types/pdiPrazos"
import { KpisPdi, BarraFiltrosPdi } from "./FiltrosPdi"
import { CardPdi } from "./CardPdi"
import { PdiDetalheModal } from "./PdiDetalheModal"

// Controle de Prazos do PDI: a fila de pacientes elegíveis (laudo de
// Psicologia ABA em uso) e o registro manual de especialista/datas que a
// Amanda/Gracielle mantêm.
//
// MOLDE ESTRUTURAL de AcompanhamentoLaudosShell.tsx: fetch único de
// /api/pdi-controle-prazos/, filtro e paginação no CLIENTE (a lista inteira
// já vem pronta do servidor — filtrar de novo no servidor a cada clique de
// KPI seria reler o relatório do Órbita à toa), busca do header com debounce
// de 200ms num componente PRÓPRIO (`BuscaHeader`, ver o comentário longo no
// original — a mesma razão vale aqui: sem isolar o texto, cada tecla
// re-renderiza o layout do dashboard inteiro).

const POR_PAGINA = 75

export function PdiPrazosShell() {
  const [itens, setItens] = useState<ItemPdi[]>([])
  const [meta, setMeta] = useState<MetaPdiPrazos | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtros, setFiltros] = useState<FiltrosPdi>(filtrosIniciais)
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<ItemPdi | null>(null)
  const [verHistorico, setVerHistorico] = useState(false)
  const [versaoFiltros, setVersaoFiltros] = useState(0)

  const aplicarBusca = useCallback((texto: string) => {
    setFiltros((f) => (f.busca === texto ? f : { ...f, busca: texto }))
    setPagina(1)
  }, [])

  const limparFiltros = useCallback(() => {
    setFiltros(filtrosIniciais())
    setPagina(1)
    setVersaoFiltros((v) => v + 1)
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await fetch("/api/pdi-controle-prazos/", { cache: "no-store" })
      const corpo = await resposta.json()
      if (!resposta.ok || !corpo?.ok) {
        throw new Error(corpo?.error ?? `HTTP ${resposta.status}`)
      }
      setItens(corpo.itens as ItemPdi[])
      setMeta(corpo.meta as MetaPdiPrazos)
    } catch (e) {
      console.error("[pdi-controle-prazos] falha ao carregar", e)
      setErro(e instanceof Error ? e.message : "erro desconhecido")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // O "hoje" do SERVIDOR, não `new Date()` no cliente — mesma base que decidiu
  // status/prioridade/alerta de cada item lá atrás.
  const hoje = meta?.hoje ?? ""

  const contagens = useMemo(() => contarKpis(itens, filtros), [itens, filtros])
  const filtrados = useMemo(() => aplicar(itens, filtros), [itens, filtros])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const daPagina = useMemo(() => filtrados.slice(inicio, inicio + POR_PAGINA), [filtrados, inicio])

  function irPara(destino: number) {
    setPagina(Math.min(Math.max(1, destino), totalPaginas))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  /** Substitui um item no lugar depois do save, sem recarregar a lista inteira. */
  const substituir = useCallback((atualizado: ItemPdi) => {
    setItens((atuais) => atuais.map((i) => (i.pacienteId === atualizado.pacienteId ? atualizado : i)))
  }, [])

  const { setRightContent } = useHeader()

  useEffect(() => {
    setRightContent(
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
        <BuscaHeader key={versaoFiltros} onBusca={aplicarBusca} />
        <BarraFiltrosPdi
          filtros={filtros}
          onChange={(f) => {
            setFiltros(f)
            setPagina(1)
          }}
          onLimpar={limparFiltros}
        />
        <button
          type="button"
          onClick={() => setVerHistorico(true)}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-muted ${foco}`}
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Histórico
        </button>
      </div>,
    )
    return () => setRightContent(null)
  }, [aplicarBusca, filtros, limparFiltros, setRightContent, versaoFiltros])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Não foi possível carregar o Controle de Prazos do PDI. {erro}
            {" — o robô do Órbita pode não ter rodado hoje."}
          </span>
        </div>
      )}

      <KpisPdi
        contagens={contagens}
        recorte={filtros.recorte}
        carregando={carregando}
        onRecorte={(recorte) => {
          setFiltros((f) => ({ ...f, recorte }))
          setPagina(1)
        }}
      />

      {carregando ? (
        <GradeEsqueleto />
      ) : filtrados.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
          {itens.length === 0
            ? "Nenhum paciente elegível para o Controle de Prazos do PDI."
            : "Nenhum paciente neste recorte."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {daPagina.map((item) => (
            <CardPdi key={item.pacienteId} item={item} onAbrir={() => setAberto(item)} />
          ))}
        </ul>
      )}

      {!carregando && filtrados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, filtrados.length)} de{" "}
            {filtrados.length} {filtrados.length === 1 ? "paciente" : "pacientes"}
            {filtrados.length !== itens.length && ` (filtrado de ${itens.length})`}
          </p>

          {totalPaginas > 1 && (
            <nav className="flex items-center gap-2" aria-label="Paginação do Controle de Prazos do PDI">
              <button
                type="button"
                onClick={() => irPara(paginaAtual - 1)}
                disabled={paginaAtual <= 1}
                className={`inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${foco}`}
              >
                Anterior
              </button>
              <span className="text-xs text-muted-foreground">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => irPara(paginaAtual + 1)}
                disabled={paginaAtual >= totalPaginas}
                className={`inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${foco}`}
              >
                Próxima
              </button>
            </nav>
          )}
        </div>
      )}

      {meta && (
        <p className="text-xs text-muted-foreground">
          Relatório <span className="font-semibold">{meta.arquivoNome}</span> ·{" "}
          {meta.linhasLidas} linhas lidas → {meta.itens} elegíveis · prazos calculados
          em {meta.hoje.split("-").reverse().join("/")}
          {meta.semCadastroPulsar > 0 &&
            ` · ${meta.semCadastroPulsar} elegível(is) sem cadastro no Pulsar (na lista mesmo assim)`}
        </p>
      )}

      {aberto && (
        <PdiDetalheModal item={aberto} hoje={hoje} onFechar={() => setAberto(null)} onSalvo={substituir} />
      )}

      {verHistorico && (
        <HistoricoCadastrosModal
          titulo="Histórico do Controle de Prazos do PDI"
          subtitulo="Todos os registros — especialista, datas e observações — quem, quando e o que mudou, mais recentes primeiro."
          entidades={["pdi_controle_prazos"]}
          onClose={() => setVerHistorico(false)}
        />
      )}
    </div>
  )
}

/**
 * O campo de busca do header — dono do PRÓPRIO texto. Ver o comentário longo
 * do mesmo componente em AcompanhamentoLaudosShell.tsx: isolar o texto aqui é
 * o que faz uma tecla re-renderizar só este componente, em vez do layout do
 * dashboard inteiro (por causa do `setRightContent`, cujo efeito depende de
 * `filtros`).
 */
const BuscaHeader = memo(function BuscaHeader({ onBusca }: { onBusca: (texto: string) => void }) {
  const [texto, setTexto] = useState("")

  useEffect(() => {
    const t = setTimeout(() => onBusca(texto), 200)
    return () => clearTimeout(t)
  }, [texto, onBusca])

  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        className={`${campo} pl-9 ${texto ? "pr-9" : ""} min-w-[160px]`}
        placeholder="Buscar nome ou ID"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar paciente"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${foco}`}
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
})

function GradeEsqueleto() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-14 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="mt-4 flex flex-col items-center">
            <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
            <div className="mt-4 h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
          <hr className="my-4 border-border" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="h-3 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
