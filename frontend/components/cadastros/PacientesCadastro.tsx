"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useHeader } from "@/contexts/HeaderContext"
import { getFotoUrlAssinada } from "@/services/pacientesFoto.service"
import {
  Search,
  UserPlus,
  AlertCircle,
  History,
  IdCard,
  Cake,
  Phone,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Check,
} from "lucide-react"
import { HistoricoCadastrosModal } from "@/components/cadastros/historico/HistoricoCadastrosModal"
import { getTomAvatar, iniciaisDe } from "@/lib/cadastros/avatarPastel"
import { usePacientes } from "@/hooks/usePacientes"
import { maskCpfCnpj, onlyDigits } from "@/lib/remuneracao/formatacao"
import { idExibicao } from "@/types/paciente"
import type { Paciente } from "@/types/paciente"
import { NovoPacienteModal } from "./pacientes/NovoPacienteModal"
import { campo, foco } from "./pacientes/ui/campos"

// Listagem do cadastro de pacientes. Os fictícios (Horário Administrativo,
// Notificação Prévia e afins) ficam de fora — não são pessoas. Os inativos
// entram: a tela de cadastro precisa enxergá-los para reativar.

// Renderizar 900+ cards de uma vez custa caro no DOM, e ninguém rola uma lista
// desse tamanho. A busca continua varrendo a base inteira — só a exibição é
// fatiada.
const PACIENTES_POR_PAGINA = 75

/** Sem acento, minúsculo — para a busca casar "Joao" com "João". */
function norm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

function dataBR(iso: string | null): string {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.slice(0, 10).split("-")
  return `${dia}/${mes}/${ano}`
}

type SituacaoFiltro = "ativo" | "inativo" | "ficticio"

const SITUACOES: { valor: SituacaoFiltro; rotulo: string }[] = [
  { valor: "ativo", rotulo: "Ativos" },
  { valor: "inativo", rotulo: "Inativos" },
  { valor: "ficticio", rotulo: "Fictícios" },
]

export function PacientesCadastro() {
  const { pacientes, loading, error } = usePacientes()
  // Texto e filtro são estados SEPARADOS: `buscaTexto` segue o teclado sem
  // atraso (o <input> nunca perde tecla), e `busca` — quem de fato refiltra
  // e re-renderiza a grade de até 75 cards — só se atualiza 200ms depois que
  // a digitação para. Sem isso, cada tecla batia refiltro + re-render da
  // grade inteira, e digitação rápida derrubava letra.
  const [buscaTexto, setBuscaTexto] = useState("")
  const [busca, setBusca] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaTexto), 200)
    return () => clearTimeout(t)
  }, [buscaTexto])
  const [modalAberto, setModalAberto] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)
  // Complementar: cada situação soma ao resultado, não filtra em cascata.
  // Default espelha o comportamento antigo (ativos + inativos, fictícios de
  // fora) — só passa a incluir fictício quem marcar de propósito.
  const [situacoes, setSituacoes] = useState<Set<SituacaoFiltro>>(
    () => new Set(["ativo", "inativo"])
  )
  const [pagina, setPagina] = useState(1)

  // A BUSCA roda sobre a lista inteira, não sobre a página. A paginação é
  // aplicada DEPOIS do filtro — por isso digitar um nome encontra o paciente
  // esteja ele na página 1 ou na 12.
  const filtrados = useMemo(() => {
    let lista = pacientes.filter((p) => situacoes.has(p.ficticio ? "ficticio" : p.ativo ? "ativo" : "inativo"))

    const termo = norm(busca)
    if (!termo) return lista

    const digitos = onlyDigits(busca)
    return lista.filter((p) => {
      if (norm(p.nome).includes(termo)) return true
      if (p.nome_civil && norm(p.nome_civil).includes(termo)) return true
      if (!digitos) return false
      if (p.cpf && onlyDigits(p.cpf).includes(digitos)) return true
      // Busca pelo MESMO número que o cartão exibe. Antes casava contra a
      // matrícula formatada, que não era o que estava escrito na tela — digitar
      // o ID lido no cartão não achava o paciente.
      return idExibicao(p).includes(digitos)
    })
  }, [pacientes, busca, situacoes])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PACIENTES_POR_PAGINA))

  // Uma busca que reduz o resultado pode deixar a página atual fora do
  // intervalo; sem isto a tela ficaria vazia sem explicação.
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * PACIENTES_POR_PAGINA

  const daPagina = useMemo(
    () => filtrados.slice(inicio, inicio + PACIENTES_POR_PAGINA),
    [filtrados, inicio]
  )

  function irPara(destino: number) {
    setPagina(Math.min(Math.max(1, destino), totalPaginas))
    // Trocar de página mantendo o scroll no rodapé deixaria o usuário no fim de
    // uma lista que acabou de mudar inteira.
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const { setRightContent } = useHeader()

  useEffect(() => {
    setRightContent(
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            className={`${campo} pl-9 w-96`}
            placeholder="Buscar nome, CPF ou ID"
            value={buscaTexto}
            onChange={(e) => {
              setBuscaTexto(e.target.value)
              setPagina(1)
            }}
            aria-label="Buscar paciente"
          />
        </div>
        <FiltroSituacao
          value={situacoes}
          onChange={(v) => {
            setSituacoes(v)
            setPagina(1)
          }}
        />
        <button
          type="button"
          onClick={() => setVerHistorico(true)}
          className={`inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${foco}`}
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Histórico
        </button>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className={`inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${foco}`}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Novo paciente
        </button>
      </div>
    )
    return () => setRightContent(null)
  }, [buscaTexto, situacoes, setRightContent])

  return (
    // Mais largo que as outras telas de cadastro: o grid precisa de espaço para
    // as 4–5 colunas em tela larga sem espremer o card.
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Não foi possível carregar os pacientes. {error}</span>
        </div>
      )}

      {loading ? (
        <GridEsqueleto />
      ) : filtrados.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
          {busca
            ? "Nenhum paciente encontrado para essa busca."
            : "Nenhum paciente cadastrado ainda."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {daPagina.map((p) => (
            <CardPaciente key={p.id_paciente} paciente={p} />
          ))}
        </ul>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Mostrando {inicio + 1}–{Math.min(inicio + PACIENTES_POR_PAGINA, filtrados.length)} de{" "}
            {filtrados.length} {filtrados.length === 1 ? "paciente" : "pacientes"}
            {busca && ` (filtrado de ${pacientes.length})`}
          </p>

          {totalPaginas > 1 && (
            <nav className="flex items-center gap-2" aria-label="Paginação de pacientes">
              <button
                type="button"
                onClick={() => irPara(paginaAtual - 1)}
                disabled={paginaAtual <= 1}
                className={`inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${foco}`}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
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
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Montado condicionalmente para nascer limpo — convenção do projeto,
          em vez de um useEffect de reset. */}
      {modalAberto && <NovoPacienteModal onFechar={() => setModalAberto(false)} />}
      {verHistorico && (
        <HistoricoCadastrosModal
          subtitulo="Todas as alterações em pacientes, responsáveis, fichas médicas, laudos e altas — mais recentes primeiro."
          entidades={[
            "paciente",
            "responsavel",
            "ficha_medica",
            "laudo",
            "alta",
            "alta_individualidade",
          ]}
          onClose={() => setVerHistorico(false)}
        />
      )}
    </div>
  )
}

/**
 * Botão que expande um painel de checkboxes — Ativos/Inativos/Fictícios,
 * complementares (marcar mais de um SOMA ao resultado, não restringe mais).
 * Substitui o antigo checkbox "Somente ativos", que só dava pra excluir
 * inativos, nunca isolar só eles.
 */
function FiltroSituacao({
  value,
  onChange,
}: {
  value: Set<SituacaoFiltro>
  onChange: (v: Set<SituacaoFiltro>) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", aoClicarFora)
    return () => document.removeEventListener("mousedown", aoClicarFora)
  }, [aberto])

  function alternar(situacao: SituacaoFiltro) {
    const novo = new Set(value)
    if (novo.has(situacao)) novo.delete(situacao)
    else novo.add(situacao)
    onChange(novo)
  }

  const resumo =
    value.size === 0
      ? "Nenhuma"
      : value.size === SITUACOES.length
        ? "Todas"
        : SITUACOES.filter((s) => value.has(s.valor)).map((s) => s.rotulo).join(", ")

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={`inline-flex w-56 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${foco}`}
      >
        <ListFilter className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Situação: {resumo}</span>
      </button>
      {aberto && (
        <div
          role="listbox"
          aria-label="Filtrar por situação"
          className="absolute left-0 top-[calc(100%+4px)] z-[100] w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {SITUACOES.map((s) => {
            const marcado = value.has(s.valor)
            return (
              <button
                key={s.valor}
                type="button"
                role="option"
                aria-selected={marcado}
                onClick={() => alternar(s.valor)}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${foco}`}
              >
                {s.rotulo}
                {marcado && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CardPaciente({ paciente }: { paciente: Paciente }) {
  const tom = getTomAvatar(paciente.id_paciente)

  return (
    <li>
      {/* O card inteiro é o alvo de clique — num diretório, mirar só o nome é
          um alvo pequeno demais para o tamanho do cartão. */}
      <Link
        href={`/cadastros/pacientes/${paciente.id_paciente}`}
        className={`group flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1.5 hover:border-foreground/15 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none ${foco}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            ID <span className="font-semibold text-foreground">{idExibicao(paciente)}</span>
          </span>
          <div className="flex flex-wrap justify-end gap-1">
            <Situacao paciente={paciente} />
            {paciente.ficticio && (
              <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Fictício
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center text-center">
          <AvatarLista paciente={paciente} tom={tom} />
          <h2 className="mt-3 text-sm font-bold leading-snug text-foreground">
            {paciente.nome}
          </h2>
        </div>

        <hr className="my-3 border-border" />

        <dl className="space-y-2 text-xs">
          <LinhaDado icone={IdCard} rotulo="CPF" valor={paciente.cpf ? maskCpfCnpj(paciente.cpf) : null} />
          <LinhaDado icone={Cake} rotulo="Nascimento" valor={dataBR(paciente.data_nascimento)} />
          <LinhaDado icone={Phone} rotulo="Celular" valor={paciente.telefone} />
        </dl>
      </Link>
    </li>
  )
}

function LinhaDado({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof IdCard
  rotulo: string
  valor: string | null
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {rotulo}
      </dt>
      <dd className="mt-0.5 font-semibold text-foreground">{valor || "—"}</dd>
    </div>
  )
}

// Falecido e inativo são estados independentes (ver 20260826100000): um paciente
// pode estar inativo por alta e continuar vivo. O falecimento é o rótulo mais
// relevante quando os dois valem, por isso vem primeiro.
function Situacao({ paciente }: { paciente: Paciente }) {
  if (paciente.falecido) {
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Falecido
      </span>
    )
  }
  if (!paciente.ativo) {
    return (
      <span className="inline-flex rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
        Inativo
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      Ativo
    </span>
  )
}

// O esqueleto imita a FORMA do card (avatar redondo, nome, três linhas de
// dado), não um bloco genérico — assim o layout não salta quando os dados
// chegam.
function GridEsqueleto() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="mt-3 flex flex-col items-center">
            <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
            <div className="mt-3 h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
          <hr className="my-3 border-border" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j}>
                <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
                <div className="mt-1 h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AvatarLista({ paciente, tom }: { paciente: Paciente, tom: { bg: string, fg: string } }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    if (!paciente.foto_path) {
      setUrl(null)
      return
    }
    getFotoUrlAssinada(paciente.foto_path).then((assinada) => {
      if (ativo) setUrl(assinada)
    })
    return () => {
      ativo = false
    }
  }, [paciente.foto_path])

  if (url) {
    return (
      <div className="flex h-16 w-16 overflow-hidden rounded-full border border-border bg-muted transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none">
        <img src={url} alt={`Foto de ${paciente.nome}`} className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <span
      className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
      style={{ backgroundColor: tom.bg, color: tom.fg }}
      aria-hidden="true"
    >
      {iniciaisDe(paciente.nome)}
    </span>
  )
}
