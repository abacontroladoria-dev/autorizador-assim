'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, History, RefreshCw,
  Target, X,
} from 'lucide-react'
import { diasUteisDe, type useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useModalDialog } from '@/hooks/useModalDialog'
import type { AutorizacaoAssimSemana, EstadoFiltro } from '../types'
import ChipTuss from './ChipTuss'
import GradeSemana from './GradeSemana'
import LinhaAutorizacao from './LinhaAutorizacao'
import { PENDENCIAS } from './pendencias'
import { diaDoTimestamp, formatarDiaComNome, hojeLocal, rotuloSemana } from './datas'
import { cartaoPendente, montarGrade } from './grade'

const ID_TITULO = 'titulo-semana-paciente'

/** "Sem vínculo" a partir de `sem-vinculo` — o nome que a tela já usa em cima. */
function rotuloDaEspecie(chave: EstadoFiltro): string {
  return PENDENCIAS.find((p) => p.chave === chave)?.rotulo.toLowerCase() ?? chave
}

/** Duas letras do nome. Não há foto de paciente no sistema — a inicial é a identidade. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/**
 * Uma das cinco espécies de pendência: contador e filtro no mesmo controle.
 *
 * Antes eram cinco números de outro vocabulário (liberadas, utilizadas, sem
 * vínculo, glosas, cancelamentos), e dois deles nem eram pendência — gastavam
 * 40% da faixa mais nobre do modal com totais que não pedem trabalho, enquanto
 * "faltando" e "sobrando", que a listagem tinha acabado de prometer, não
 * apareciam em lugar nenhum.
 *
 * Três canais, um significado cada, como nas chips de TUSS:
 *
 * - o MATIZ é a espécie, e só acende quando há trabalho dela. Uma fileira de
 *   cinco cartões coloridos onde três dizem "0" gasta a cor em repouso e deixa
 *   de apontar para onde há o que fazer.
 * - o ANEL DE STEEL é a seleção. "Você está aqui" nunca usa matiz semântico.
 * - o RÓTULO é a palavra, sempre presente: a cor nunca é o único sinal.
 *
 * Zero continua clicável e visível — "nenhuma glosa nesta semana" é informação,
 * e esconder o contador faz a ausência parecer com a tela ainda carregando.
 *
 * Só degraus que o shim de tema escuro de globals.css remapeia (-50/-100/-200/
 * -300 e texto -700). `bg-white/70`, que era o desenho anterior da bolha,
 * atravessava claro para o escuro: modificador de opacidade não é remapeado.
 */
function Indicador({
  valor, rotulo, Icone, tom, bolha, ajuda, ativo, onToggle,
}: {
  valor: number
  rotulo: string
  Icone: typeof CheckCircle2
  tom: string
  bolha: string
  ajuda: string
  ativo: boolean
  onToggle: () => void
}) {
  const aceso = valor > 0
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={ativo}
      title={ajuda}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
        aceso ? tom : 'border-slate-200 bg-white hover:bg-slate-50'
      } ${ativo ? 'ring-2 ring-brand ring-offset-1' : ''}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          aceso ? bolha : 'bg-slate-100'
        }`}
      >
        <Icone size={15} className={aceso ? '' : 'text-slate-500'} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xl leading-none font-bold tabular-nums text-slate-900">{valor}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-600">{rotulo}</span>
      </span>
    </button>
  )
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
 * com problema. Três causas, três correções:
 *
 * 1. o modal falava outro vocabulário que a linha que o abria. Os cinco
 *    indicadores agora são as cinco espécies de `PENDENCIAS`, pela mesma
 *    `contarPendencias` que monta as colunas da listagem;
 * 2. cada indicador virou o filtro daquela espécie, o que apagou o botão
 *    "Filtros", a faixa colapsável e o componente `FiltrosEstado` — três
 *    controles onde bastava um;
 * 3. "faltando" e "sobrando" deixaram de ser agregados e viraram marcas nos
 *    cartões (ver `sessaoSemCobertura` e `guiasExcedentes`), e o rodapé ganhou
 *    um navegador que pula de pendência em pendência — que é também o único
 *    caminho de teclado até elas.
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

  const { estadoFiltro, setEstadoFiltro } = analise
  const alternarFiltro = useCallback(
    (chave: EstadoFiltro) => setEstadoFiltro(estadoFiltro === chave ? null : chave),
    [estadoFiltro, setEstadoFiltro]
  )

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

        {/* ── As cinco espécies: contador e filtro no mesmo controle ───────── */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-3 sm:px-6 xl:grid-cols-5">
          {PENDENCIAS.map(({ chave, rotulo, Icone, tom, bolha, ajuda }) => (
            <Indicador
              key={chave}
              valor={contagem[chave]}
              rotulo={rotulo}
              Icone={Icone}
              tom={tom}
              bolha={bolha}
              ajuda={ajuda}
              ativo={estadoFiltro === chave}
              onToggle={() => alternarFiltro(chave)}
            />
          ))}
        </div>

        {/* ── A cota por TUSS: outra pergunta, faixa própria ───────────────── */}
        {/* Só com mais de um TUSS. Com um só, a chip não filtra nada e repete os
            números que os indicadores já deram — uma faixa inteira de altura
            para dizer o que já está dito. */}
        {analise.placar.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-2 sm:px-6">
            {analise.placar.map((p) => (
              <ChipTuss
                key={p.codigo_tuss}
                item={p}
                ativa={analise.tussFiltro === p.codigo_tuss}
                onToggle={analise.setTussFiltro}
              />
            ))}
          </div>
        )}

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
                {analise.tussFiltro || estadoFiltro
                  ? 'Nada neste recorte'
                  : 'Nenhum atendimento nem guia nesta semana'}
              </p>
              <p className="max-w-md text-xs text-slate-500">
                {analise.tussFiltro || estadoFiltro
                  ? 'Toque no indicador aceso outra vez para ver a semana inteira.'
                  : `Nem a clínica agendou, nem a ASSIM registrou nada de seg a sex para ${analise.pacienteNome}.`}
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
                  {estadoFiltro
                    ? `— ${totalAutorizacoes} em ${rotuloDaEspecie(estadoFiltro)}`
                    : `— ${totalAutorizacoes} ${totalAutorizacoes === 1 ? 'guia' : 'guias'}`}
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
