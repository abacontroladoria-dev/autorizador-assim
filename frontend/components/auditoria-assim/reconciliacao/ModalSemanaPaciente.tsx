'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertOctagon, AlertTriangle, Ban, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, History,
  Link2, RefreshCw, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react'
import { diasUteisDe, type useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useModalDialog } from '@/hooks/useModalDialog'
import type { AutorizacaoAssimSemana } from '../types'
import ChipTuss from './ChipTuss'
import FiltrosEstado from './FiltrosEstado'
import GradeSemana from './GradeSemana'
import LinhaAutorizacao from './LinhaAutorizacao'
import { diaDoTimestamp, formatarDiaComNome, hojeLocal, rotuloSemana } from './datas'
import { montarGrade } from './grade'

const ID_TITULO = 'titulo-semana-paciente'

const ROTULO_FILTRO: Record<string, string> = {
  'sem-vinculo': 'sem vínculo',
  glosa: 'glosas',
  cancelada: 'canceladas',
}

/** Duas letras do nome. Não há foto de paciente no sistema — a inicial é a identidade. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/**
 * Um dos cinco números do resumo da semana.
 *
 * O matiz só aparece quando o número é maior que zero: uma fileira de cinco
 * cartões coloridos onde três deles dizem "0" gasta a cor em repouso e deixa de
 * apontar para onde há trabalho. Zero recua para branco e cinza.
 *
 * `tom` e `bolha` usam só degraus que o shim de tema escuro de globals.css
 * remapeia (-50/-100/-200/-300 e texto -700). `bg-white/70` na bolha, que era o
 * desenho anterior, atravessava claro para o escuro — modificador de opacidade
 * não é remapeado.
 */
function Indicador({
  valor, rotulo, Icone, tom, bolha, atencao,
}: {
  valor: number
  rotulo: string
  Icone: typeof CheckCircle2
  tom: string
  bolha: string
  atencao?: boolean
}) {
  const aceso = !!atencao && valor > 0
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
        aceso ? tom : 'border-slate-200 bg-white'
      }`}
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
    </div>
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
 */
export default function ModalSemanaPaciente({
  open, onClose, analise, podeVincular, codigosGlosa, onVincularGuia,
}: Props) {
  const fechar = useCallback(() => onClose(), [onClose])
  const { refDialogo, propsDialogo } = useModalDialog(open, fechar, ID_TITULO)

  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const refHistorico = useRef<HTMLElement>(null)

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

  const dias = useMemo(() => diasUteisDe(analise.semanaInicio), [analise.semanaInicio])

  const linhas = useMemo(
    () =>
      montarGrade(
        analise.sessoesVisiveis,
        analise.autorizacoesVisiveis,
        analise.estadoDaGuia,
        dias,
        analise.placar
      ),
    [analise.sessoesVisiveis, analise.autorizacoesVisiveis, analise.estadoDaGuia, dias, analise.placar]
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
          {analise.pacienteNome}, semana de {labelSemana}. {analise.liberadas} autorização(ões)
          liberada(s), {analise.utilizadas} utilizada(s), {analise.ledger.semVinculo} sem vínculo,{' '}
          {analise.ledger.glosas} glosa(s), {analise.ledger.canceladas} cancelada(s).
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              aria-label="Próxima semana"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => setMostrarFiltros((v) => !v)}
              aria-pressed={mostrarFiltros}
              className={`ml-1 inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                mostrarFiltros || analise.tussFiltro || analise.estadoFiltro
                  ? 'border-brand bg-brand-surface text-brand-fg'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal size={13} aria-hidden />
              Filtros
              {(analise.tussFiltro || analise.estadoFiltro) && (
                <span className="rounded-full bg-brand-fg px-1.5 text-[10px] font-bold text-white">
                  {(analise.tussFiltro ? 1 : 0) + (analise.estadoFiltro ? 1 : 0)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ── Resumo da semana ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-3 sm:px-6 xl:grid-cols-5">
          <Indicador
            valor={analise.liberadas}
            rotulo="Autorizações liberadas"
            Icone={ShieldCheck}
            tom="border-slate-200 bg-white"
            bolha="bg-slate-100"
          />
          <Indicador
            valor={analise.utilizadas}
            rotulo="Utilizadas"
            Icone={CheckCircle2}
            tom="border-emerald-200 bg-emerald-50 text-emerald-700"
            bolha="bg-emerald-100"
            atencao
          />
          <Indicador
            valor={analise.ledger.semVinculo}
            rotulo="Sem vínculo"
            Icone={Link2}
            tom="border-amber-300 bg-amber-50 text-amber-700"
            bolha="bg-amber-100"
            atencao
          />
          <Indicador
            valor={analise.ledger.glosas}
            rotulo="Glosas"
            Icone={AlertOctagon}
            tom="border-violet-200 bg-violet-50 text-violet-700"
            bolha="bg-violet-100"
            atencao
          />
          <Indicador
            valor={analise.ledger.canceladas}
            rotulo="Cancelamentos"
            Icone={Ban}
            tom="border-slate-300 bg-slate-100 text-slate-600"
            bolha="bg-slate-200"
            atencao
          />
        </div>

        {/* ── Os dois recortes: cota por TUSS e estado da guia ─────────────── */}
        {mostrarFiltros && analise.placar.length > 0 && (
          <div className="flex flex-col gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {analise.placar.map((p) => (
                <ChipTuss
                  key={p.codigo_tuss}
                  item={p}
                  ativa={analise.tussFiltro === p.codigo_tuss}
                  onToggle={analise.setTussFiltro}
                />
              ))}
              <span className="shrink-0 pl-2 text-xs text-slate-500">
                {analise.totalExcedente > 0
                  ? `${analise.totalExcedente} ${analise.totalExcedente === 1 ? 'autorização' : 'autorizações'} além do agendado`
                  : 'nenhum excedente na semana'}
              </span>
            </div>

            <FiltrosEstado
              ledger={analise.ledger}
              valor={analise.estadoFiltro}
              onEscolher={analise.setEstadoFiltro}
            />
          </div>
        )}

        {/* ── A grade ─────────────────────────────────────────────────────── */}
        {/* Fundo branco no contêiner inteiro, e não só sob a grade: a grade
            raramente chega ao pé do modal, e uma faixa cinza logo abaixo da
            última linha fazia parecer que faltava carregar algo. */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
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
                {analise.tussFiltro || analise.estadoFiltro
                  ? 'Nada neste recorte'
                  : 'Nenhum atendimento nem guia nesta semana'}
              </p>
              <p className="max-w-md text-xs text-slate-500">
                {analise.tussFiltro || analise.estadoFiltro
                  ? 'Limpe os filtros para ver a semana inteira.'
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
                  {analise.estadoFiltro
                    ? `— ${totalAutorizacoes} ${ROTULO_FILTRO[analise.estadoFiltro]}`
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

        {/* ── Rodapé: legenda e saídas ────────────────────────────────────── */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-700" aria-hidden /> Utilizada
            </li>
            <li className="flex items-center gap-1.5">
              <Link2 size={13} className="text-amber-700" aria-hidden /> Sem vínculo
            </li>
            <li className="flex items-center gap-1.5">
              <AlertOctagon size={13} className="text-violet-700" aria-hidden /> Glosa
            </li>
            <li className="flex items-center gap-1.5">
              <Ban size={13} className="text-slate-500" aria-hidden /> Cancelada
            </li>
          </ul>

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
