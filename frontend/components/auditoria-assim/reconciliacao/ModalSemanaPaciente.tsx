'use client'

import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, RefreshCw, X } from 'lucide-react'
import { diasUteisDe, type useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useModalDialog } from '@/hooks/useModalDialog'
import type { CartaoGrade } from '../types'
import DetalheCartao from './DetalheCartao'
import GradeSemana from './GradeSemana'
import { PENDENCIAS } from './pendencias'
import { hojeLocal, rotuloSemana } from './datas'
import { montarGrade } from './grade'

const ID_TITULO = 'titulo-semana-paciente'

/** "17–21" — a semana em duas datas, sem o mês, que a faixa já diz. */
function rotuloCurtoSemana(inicio: string, fim: string): string {
  return `${inicio.slice(8, 10)}–${fim.slice(8, 10)}`
}

/**
 * O mês do paciente, semana a semana — a resposta para "onde está a pendência?".
 *
 * A listagem é mensal e a grade é semanal, e até 2026-08-24 nada ligava as duas:
 * o modal abria na semana da última autorização, que não é onde está o trabalho.
 * Quem clicava numa linha de "Faltando 3" podia cair numa semana limpa e não
 * tinha como saber para que lado navegar.
 *
 * Cada segmento diz quantos cartões marcados aquela semana tem. O ponto no lugar
 * do número é deliberado: "0" repetido em quatro segmentos vira ruído com peso
 * de dado, e o que importa ali é só distinguir "tem" de "não tem".
 *
 * A semana aberta usa o steel da marca, nunca matiz semântico — é "você está
 * aqui", não um estado. E o número marcado usa âmbar, o mesmo matiz que essa
 * tela usa para "esperando alguém olhar".
 */
function FaixaDeSemanas({
  semanas,
  atual,
  onEscolher,
}: {
  semanas: { inicio: string; fim: string; marcados: number }[]
  atual: string
  onEscolher: (inicio: string) => void
}) {
  if (semanas.length < 2) return null

  return (
    <nav
      aria-label="Semanas do mês"
      className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-1.5 sm:px-6"
    >
      {semanas.map(({ inicio, fim, marcados }) => {
        const aberta = inicio === atual
        return (
          <button
            key={inicio}
            type="button"
            onClick={() => onEscolher(inicio)}
            aria-current={aberta ? 'true' : undefined}
            aria-label={`Semana de ${rotuloCurtoSemana(inicio, fim)}, ${
              marcados === 0 ? 'nada a conferir' : `${marcados} a conferir`
            }`}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
              aberta
                ? 'bg-brand-surface font-semibold text-brand-fg'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            <span className="tabular-nums">{rotuloCurtoSemana(inicio, fim)}</span>
            {marcados > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold tabular-nums text-amber-800">
                {marcados}
              </span>
            ) : (
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

/** Duas letras do nome. Não há foto de paciente no sistema — a inicial é a identidade. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

type Props = {
  open: boolean
  onClose: () => void
  analise: ReturnType<typeof useAnaliseReincidencia>
  podeVincular: boolean
  codigosGlosa: Map<string, string>
  onVincularGuia: (guia: string) => void
}

/**
 * A semana de um paciente, em grade — a segunda tela dentro da tela.
 *
 * Por que modal e não rota: a decisão que se toma aqui (esta guia cobre qual
 * sessão?) volta imediatamente para a listagem, que é onde está a fila de
 * trabalho. Perder a listagem a cada paciente aberto obrigaria a refazer o
 * recorte da semana a cada volta — e a listagem é a única visão de quantos
 * ainda faltam.
 *
 * Ele não busca nada ao abrir: a semana inteira da clínica já está em memória
 * (ver useAnaliseReincidencia), então o recorte deste paciente é um `useMemo`.
 * É o que garante que os números daqui sejam os MESMOS da linha clicada — não
 * uma segunda contagem que pode divergir.
 *
 * ── O que mudou em 2026-08-24 ──────────────────────────────────────────────
 *
 * A queixa era que o modal não tinha hierarquia e não dizia QUAL sessão estava
 * com problema. O que sobrou, depois de o usuário podar o que não queria:
 *
 * 1. "faltando" e "sobrando" deixaram de ser agregados por TUSS e viraram
 *    marcas nos cartões (`sessaoSemCobertura`, `guiasExcedentes`) — é o que
 *    torna a pendência apontável, que era o pedido literal;
 * 2. o cartão passou a ter duas espécies, e a diferença é de SILHUETA: o
 *    saudável colapsa em duas linhas, o pendente fica inteiro com barra
 *    lateral. Com seis matizes a 11px a cor tinha parado de discriminar;
 * 3. todo cartão virou botão e abre uma GAVETA com tudo o que se sabe sobre
 *    ele — o que aposentou a seção "histórico de autorizações" e, com ela, o
 *    rodapé inteiro. Ver `DetalheCartao`;
 * 4. a faixa de semanas do mês tomou o lugar do seletor de semana no cabeçalho,
 *    e o modal passou a abrir na primeira semana que tem cartão marcado.
 *
 * **Não há mais filtro nenhum aqui.** Os indicadores das cinco espécies e as
 * chips de cota por TUSS foram removidos a pedido, e cada um era o filtro do
 * que nomeava; o modal mostra a semana inteira, sempre. As cinco contagens
 * sobrevivem só no resumo `sr-only`, para quem lê por leitor de tela — a
 * listagem continua sendo onde elas se leem com os olhos.
 */
export default function ModalSemanaPaciente({
  open, onClose, analise, podeVincular, codigosGlosa, onVincularGuia,
}: Props) {
  /** O cartão aberto na gaveta lateral. Nulo = só a grade. */
  const [detalhe, setDetalhe] = useState<CartaoGrade | null>(null)

  /**
   * Escape fecha a GAVETA primeiro, e só depois o modal.
   *
   * A gaveta não instala focus trap próprio de propósito (ver `DetalheCartao`),
   * então quem escuta o Escape continua sendo o `useModalDialog` daqui — em
   * captura no `document`, antes de qualquer handler do React. Encadear os dois
   * estágios AQUI é o único ponto onde funciona: um `onKeyDown` na gaveta
   * parece resolver e não resolve.
   */
  const fechar = useCallback(() => {
    if (detalhe) {
      setDetalhe(null)
      return
    }
    onClose()
  }, [detalhe, onClose])
  const { refDialogo, propsDialogo } = useModalDialog(open, fechar, ID_TITULO)

  const dias = useMemo(() => diasUteisDe(analise.semanaInicio), [analise.semanaInicio])

  const linhas = useMemo(
    () =>
      montarGrade(
        analise.sessoesVisiveis,
        analise.autorizacoesVisiveis,
        analise.estadoDaGuia,
        dias,
        analise.placar,
        {
          descoberta: analise.sessaoDescoberta,
          decorrida: analise.sessaoJaDecorrida,
          excedentes: analise.guiasExcedentes,
        }
      ),
    [
      analise.sessoesVisiveis, analise.autorizacoesVisiveis, analise.estadoDaGuia, dias,
      analise.placar, analise.sessaoDescoberta, analise.sessaoJaDecorrida,
      analise.guiasExcedentes,
    ]
  )

  /**
   * A gaveta fecha quando o recorte atrás dela muda — abrir/fechar o modal,
   * trocar de paciente, trocar de semana.
   *
   * Fechar o modal NÃO desmonta este componente: ele renderiza `null` e a
   * instância continua viva, com o estado inteiro. Sem esta guarda, abrir a
   * gaveta, fechar o modal e abrir outro paciente trazia a gaveta já aberta —
   * mostrando o cartão do paciente anterior. Trocar de semana tinha o mesmo
   * defeito, com um cartão que não está mais na grade atrás.
   *
   * Ajustado durante o render e não num efeito: é o padrão que o React recomenda
   * para "resetar estado quando uma prop muda", e um efeito com setState
   * síncrono aqui causaria renderização em cascata.
   */
  const recorte = `${open}|${analise.pacienteNome ?? ''}|${analise.semanaInicio}`
  const [recorteAnterior, setRecorteAnterior] = useState(recorte)
  if (recorteAnterior !== recorte) {
    setRecorteAnterior(recorte)
    setDetalhe(null)
  }

  if (!open || !analise.pacienteNome) return null

  const labelSemana = rotuloSemana(analise.semanaInicio, analise.semanaFim)
  const linha = analise.linhaSelecionada
  const { contagem } = analise
  const rotuloMes = new Date(
    Number(analise.mesRef.slice(0, 4)),
    Number(analise.mesRef.slice(5, 7)) - 1,
    1
  ).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex h-[95dvh] w-full max-w-460 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* As cinco contagens não têm mais forma visual neste modal (os
            indicadores saíram a pedido), mas continuam ditas aqui: para quem lê
            por leitor de tela, elas são a única síntese da semana. */}
        <p className="sr-only" role="status" aria-live="polite">
          {analise.pacienteNome}, semana de {labelSemana}. {contagem.total} pendência(s):{' '}
          {PENDENCIAS.map((p) => `${contagem[p.chave]} ${p.rotulo.toLowerCase()}`).join(', ')}.
        </p>

        {/* ── Identidade + as semanas do mês ──────────────────────────────── */}
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-surface text-sm font-bold text-brand-fg"
            >
              {iniciais(analise.pacienteNome)}
            </span>
            <div className="min-w-0">
              <h2
                id={ID_TITULO}
                className="truncate text-lg leading-tight font-bold text-slate-900"
                title={analise.pacienteNome}
              >
                {analise.pacienteNome}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                <span className="tabular-nums">
                  {analise.carteirinhaDoPaciente ?? 'sem carteirinha'}
                </span>
                {linha?.plano && <> · {linha.plano}</>}
                {linha?.unidade && <> · {linha.unidade}</>}
                {analise.idsDoPaciente.length > 1 && (
                  /* Nome não é identidade. Dizer que são dois cadastros é melhor
                     que escolher um em silêncio e mostrar meia semana como se
                     fosse toda. */
                  <span className="text-amber-700">
                    {' '}· dois cadastros ({analise.idsDoPaciente.join(', ')}), somados aqui
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* A faixa É o seletor de semana — não há mais setas nem rótulo de
              intervalo ao lado. Duas formas de escolher a mesma coisa custavam
              a largura do cabeçalho e escondiam, atrás das setas, a informação
              que a faixa dá de graça: em qual semana está o trabalho. */}
          <div className="flex min-w-0 items-center gap-2 lg:shrink-0">
            <span className="hidden shrink-0 items-center gap-1.5 text-slate-500 sm:flex">
              <CalendarDays size={15} aria-hidden />
              {/* `capitalize` daria "Agosto De 2026" — ele sobe a inicial de cada
                  palavra. `first-letter` só pega em caixa de bloco, daí o
                  `inline-block`. */}
              <span className="inline-block text-[12px] font-semibold first-letter:uppercase">
                {rotuloMes}
              </span>
            </span>
            <FaixaDeSemanas
              semanas={analise.semanasDoMes}
              atual={analise.semanaInicio}
              onEscolher={analise.irParaSemanaEm}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ── A grade, e a gaveta ao lado dela ────────────────────────────── */}
        {/* O contêiner externo é `relative` para a gaveta se ancorar nele, e não
            no scroller: ancorada dentro do scroller, ela subiria junto com a
            grade ao rolar. */}
        <div className="relative flex min-h-0 flex-1">
          {/* Um scroller só, nos DOIS eixos, e `relative`. Os dois detalhes são
              medidos: com um `overflow-x` próprio dentro da grade, o cabeçalho
              dos dias deixa de grudar (o sticky passa a mirar o contêiner de
              dentro, que não rola na vertical); sem `relative`, a largura mínima
              da grade escapa e é o DOCUMENTO que rola de lado a 390px. */}
          <div className="relative min-h-0 flex-1 overflow-auto bg-white">
            {analise.erro ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <AlertTriangle size={24} className="text-rose-600" />
                <p className="text-sm font-medium text-slate-700">{analise.erro}</p>
                <button
                  onClick={analise.recarregar}
                  className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-brand hover:bg-brand-hover hover:text-brand-fg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <RefreshCw size={13} />
                  Tentar novamente
                </button>
              </div>
            ) : analise.carregandoSemana ? (
              <div className="space-y-2 p-4 sm:p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : linhas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-24 text-center">
                <CheckCircle2 size={22} className="text-slate-400" />
                <p className="text-sm font-medium text-slate-600">
                  Nenhum atendimento nem guia nesta semana
                </p>
                <p className="max-w-md text-xs text-slate-500">
                  Nem a clínica agendou, nem a ASSIM registrou nada de seg a sex para{' '}
                  {analise.pacienteNome}.
                </p>
              </div>
            ) : (
              <GradeSemana
                linhas={linhas}
                dias={dias}
                hoje={hojeLocal()}
                codigosGlosa={codigosGlosa}
                chaveAberta={detalhe?.chave ?? null}
                onAbrirDetalhe={setDetalhe}
              />
            )}
          </div>

          {detalhe && (
            <>
              {/* O véu é clicável e nomeado: fechar tocando fora da gaveta é o
                  gesto que se espera, e sem `aria-label` ele seria um botão sem
                  nome para o leitor de tela.

                  z-40/z-50 e não z-10/z-20: as células grudadas do cabeçalho da
                  grade são z-30, e `position: relative` sem z-index não abre
                  contexto de empilhamento — as duas competem no mesmo plano.
                  Medido a 390px, "Horário" aparecia POR CIMA da gaveta. */}
              <button
                type="button"
                aria-label="Fechar o detalhe"
                onClick={() => setDetalhe(null)}
                className="absolute inset-0 z-40 cursor-default bg-slate-900/10"
              />
              <DetalheCartao
                cartao={detalhe}
                codigosGlosa={codigosGlosa}
                podeVincular={podeVincular}
                onVincular={onVincularGuia}
                onFechar={() => setDetalhe(null)}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
