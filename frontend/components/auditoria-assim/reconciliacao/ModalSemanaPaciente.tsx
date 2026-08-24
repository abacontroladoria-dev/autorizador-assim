'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, History, RefreshCw,
  Target, X,
} from 'lucide-react'
import { diasUteisDe, type useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useModalDialog } from '@/hooks/useModalDialog'
import type { AutorizacaoAssimSemana } from '../types'
import GradeSemana from './GradeSemana'
import LinhaAutorizacao from './LinhaAutorizacao'
import { PENDENCIAS } from './pendencias'
import { diaDoTimestamp, formatarDiaComNome, hojeLocal, rotuloSemana } from './datas'
import { cartaoPendente, montarGrade } from './grade'

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
 * 3. o rodapé ganhou um navegador que pula de cartão marcado em cartão
 *    marcado — que é também o único caminho de teclado até eles.
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
  const fechar = useCallback(() => onClose(), [onClose])
  const { refDialogo, propsDialogo } = useModalDialog(open, fechar, ID_TITULO)

  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  // -1 = ninguém navegou ainda. O modal abre neutro: os cartões pendentes já se
  // destacam sozinhos pela altura, e pôr o anel de seleção em algo que a pessoa
  // não escolheu faria a tela responder a uma pergunta que ela não fez.
  const [foco, setFoco] = useState(-1)
  const refHistorico = useRef<HTMLElement>(null)
  const refRolagem = useRef<HTMLDivElement>(null)

  const dias = useMemo(() => diasUteisDe(analise.semanaInicio), [analise.semanaInicio])

  const linhas = useMemo(
    () =>
      montarGrade(
        analise.sessoesVisiveis,
        analise.autorizacoesVisiveis,
        analise.estadoDaGuia,
        dias,
        analise.placar,
        { descoberta: analise.sessaoDescoberta, excedentes: analise.guiasExcedentes }
      ),
    [
      analise.sessoesVisiveis, analise.autorizacoesVisiveis, analise.estadoDaGuia, dias,
      analise.placar, analise.sessaoDescoberta, analise.guiasExcedentes,
    ]
  )

  /**
   * As pendências da semana, em ordem de leitura: por faixa de horário e, dentro
   * dela, da segunda para a sexta.
   *
   * É a ordem em que a agenda é lida, e não a ordem em que os dados chegaram —
   * um navegador que pula de sexta para segunda e volta para quarta obriga a
   * pessoa a se reorientar a cada passo.
   */
  const pendencias = useMemo(() => {
    const achadas: { chave: string; rotulo: string }[] = []
    for (const linha of linhas) {
      for (const dia of dias) {
        for (const c of linha.celulas[dia] ?? []) {
          if (cartaoPendente(c)) {
            achadas.push({ chave: c.chave, rotulo: `${formatarDiaComNome(dia)} ${c.hora}` })
          }
        }
      }
    }
    return achadas
  }, [linhas, dias])

  // O foco volta a neutro quando o conjunto muda (trocou a semana, mexeu num
  // filtro): manter o índice apontaria para outro cartão sem avisar. Ajustado
  // durante o render, não num efeito — um efeito com setState síncrono aqui
  // causaria uma renderização em cascata.
  const assinatura = pendencias.map((p) => p.chave).join('|')
  const [assinaturaAnterior, setAssinaturaAnterior] = useState(assinatura)
  if (assinaturaAnterior !== assinatura) {
    setAssinaturaAnterior(assinatura)
    setFoco(-1)
  }

  const alvo = foco >= 0 ? pendencias[foco] ?? null : null

  /**
   * Traz a pendência em foco para a vista.
   *
   * `behavior` respeita `prefers-reduced-motion` — a rolagem suave de uma grade
   * inteira é justamente o tipo de movimento que a preferência existe para
   * evitar. `block: 'center'` e não `'start'`: a linha do horário é grudada no
   * topo, e alinhar pelo topo esconderia o cartão atrás dela.
   */
  useEffect(() => {
    if (!open || !alvo) return
    const alvoNoDom = refRolagem.current?.querySelector(`[data-chave="${CSS.escape(alvo.chave)}"]`)
    if (!alvoNoDom) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    alvoNoDom.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' })
  }, [open, alvo])

  /**
   * Abrir o histórico o traz para a vista.
   *
   * Ele nasce abaixo da grade, fora da área visível: sem isto, clicar no botão
   * do rodapé não muda nada na tela e o controle parece quebrado. O scroll roda
   * no próximo quadro, quando a seção já existe no DOM.
   */
  const alternarHistorico = useCallback(() => {
    setMostrarHistorico((v) => {
      if (!v) requestAnimationFrame(() => refHistorico.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      return !v
    })
  }, [])

  const autorizacoesPorDia = useMemo(() => {
    const mapa = new Map<string, AutorizacaoAssimSemana[]>()
    for (const a of analise.autorizacoesVisiveis) {
      const dia = diaDoTimestamp(a.data_execucao) ?? '—'
      const atual = mapa.get(dia)
      if (atual) atual.push(a)
      else mapa.set(dia, [a])
    }
    return mapa
  }, [analise.autorizacoesVisiveis])

  if (!open || !analise.pacienteNome) return null

  const labelSemana = rotuloSemana(analise.semanaInicio, analise.semanaFim)
  const linha = analise.linhaSelecionada
  const totalAutorizacoes = analise.autorizacoesVisiveis.length
  const { contagem } = analise

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
        <p className="sr-only" role="status" aria-live="polite">
          {analise.pacienteNome}, semana de {labelSemana}. {contagem.total} pendência(s):{' '}
          {PENDENCIAS.map((p) => `${contagem[p.chave]} ${p.rotulo.toLowerCase()}`).join(', ')}.
        </p>

        {/* ── Identidade + semana ─────────────────────────────────────────── */}
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
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

          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => analise.irParaSemana(-1)}
              disabled={!analise.podeSemanaAnterior}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="flex items-center gap-2 px-1 text-center">
              <CalendarDays size={15} className="text-slate-400" aria-hidden />
              <span>
                <span className="block text-sm leading-tight font-semibold tabular-nums text-slate-700">
                  {labelSemana}
                </span>
                <span className="block text-[11px] leading-tight text-slate-500">
                  {analise.semanaInicio === analise.semanaAtual ? 'semana atual' : 'seg a sex'}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => analise.irParaSemana(1)}
              disabled={!analise.podeProximaSemana}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Próxima semana"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <FaixaDeSemanas
          semanas={analise.semanasDoMes}
          atual={analise.semanaInicio}
          onEscolher={analise.irParaSemanaEm}
        />

        {/* ── A grade ─────────────────────────────────────────────────────── */}
        {/* Fundo branco no contêiner inteiro, e não só sob a grade: a grade
            raramente chega ao pé do modal, e uma faixa cinza logo abaixo da
            última linha fazia parecer que faltava carregar algo. */}
        {/* Um scroller só, nos DOIS eixos, e `relative`. Os dois detalhes são
            medidos: com um `overflow-x` próprio dentro da grade, o cabeçalho dos
            dias deixa de grudar (o sticky passa a mirar o contêiner de dentro,
            que não rola na vertical); sem `relative`, a largura mínima da grade
            escapa e é o DOCUMENTO que rola de lado a 390px. */}
        <div ref={refRolagem} className="relative min-h-0 flex-1 overflow-auto bg-white">
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
              podeVincular={podeVincular}
              onVincularGuia={onVincularGuia}
              chaveDestacada={alvo?.chave ?? null}
            />
          )}

          {/* Histórico: a mesma leitura cronológica que a tela sempre teve, com o
              motivo da recusa por extenso — coisa que não cabe num cartão de
              célula. Fechado por padrão porque a grade é o assunto. */}
          {mostrarHistorico && !analise.erro && (
            <section
              ref={refHistorico}
              className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6"
              aria-label="Histórico de autorizações"
            >
              <h3 className="mb-2 text-[13px] font-semibold text-brand-fg">
                Autorizações da semana{' '}
                <span className="font-normal text-slate-500">
                  — {totalAutorizacoes} {totalAutorizacoes === 1 ? 'guia' : 'guias'}
                </span>
              </h3>
              {totalAutorizacoes === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  A ASSIM não registrou nada de seg a sex neste recorte.
                </p>
              ) : (
                [...autorizacoesPorDia.entries()].map(([dia, doDia]) => (
                  <div key={dia}>
                    <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      {dia === '—' ? 'sem data' : formatarDiaComNome(dia)}
                    </p>
                    <ul className="space-y-1.5">
                      {doDia.map((a) => (
                        <LinhaAutorizacao
                          key={a.guia}
                          item={a}
                          estado={analise.estadoDaGuia(a.guia)}
                          podeVincular={podeVincular}
                          codigosGlosa={codigosGlosa}
                          onVincular={() => onVincularGuia(a.guia)}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          )}
        </div>

        {/* ── Rodapé: o navegador de pendências e as saídas ────────────────── */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
          {/*
            O navegador é o que transforma a grade em fila de trabalho sem
            deixar de ser grade: ele leva a pessoa até o cartão, no lugar de
            listá-lo em outro canto e obrigá-la a achá-lo de novo. E é o único
            caminho de teclado até as pendências — a grade tem cinco colunas de
            células, e chegar na terceira por Tab é impraticável.
          */}
          {pendencias.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Target size={14} className="shrink-0 text-brand-fg" aria-hidden />
              <button
                type="button"
                onClick={() => setFoco((i) => (i <= 0 ? pendencias.length - 1 : i - 1))}
                aria-label="Pendência anterior"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-[12px] whitespace-nowrap text-slate-600" role="status" aria-live="polite">
                {alvo ? (
                  <>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {foco + 1} de {pendencias.length}
                    </span>
                    <span className="ml-1.5 tabular-nums">· {alvo.rotulo}</span>
                  </>
                ) : (
                  /*
                    "a conferir na grade", e não "pendências na semana": este
                    número conta CARTÕES para percorrer, e os indicadores lá em
                    cima contam ESPÉCIES. Os dois divergem por construção — um
                    cancelamento não pede visita, e a glosa aparece uma vez só,
                    no cartão da sessão que ela recusou, ainda que conte no
                    indicador de glosas e no de faltando. Chamar os dois de
                    "pendências" faria a tela parecer errada consigo mesma.
                  */
                  <>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {pendencias.length}
                    </span>{' '}
                    a conferir na grade
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setFoco((i) => (i + 1) % pendencias.length)}
                aria-label="Próxima pendência"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <CheckCircle2 size={14} className="text-emerald-700" aria-hidden />
              Nada a conferir nesta semana
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={alternarHistorico}
              aria-pressed={mostrarHistorico}
              className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-4 text-[12px] font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                mostrarHistorico
                  ? 'border-brand bg-brand-surface text-brand-fg'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-brand hover:bg-brand-hover hover:text-brand-fg'
              }`}
            >
              <History size={13} aria-hidden />
              {mostrarHistorico ? 'Ocultar histórico' : 'Ver histórico de autorizações'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-xl bg-brand-fg px-5 text-[12px] font-semibold text-white transition hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Fechar
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  )
}
