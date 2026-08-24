'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { ChartColumn, RefreshCw, Search, X } from 'lucide-react'
import { useModalDialog } from '@/hooks/useModalDialog'
import { useResumoGerencial, type FatiaKpis, type MetricaFoco } from '@/hooks/useResumoGerencial'
import { KPI_VISUAL, ORDEM_KPIS, type MetricaKpi } from './kpisVisual'
import { useGlosaCodigos } from '@/hooks/useGlosaCodigos'

type Props = {
  aberto: boolean
  onClose: () => void
}

/** "2026-08-10" → "10/08". Por fatia de string: `new Date('2026-08-10')` é lido
 *  como UTC e devolve o dia anterior em São Paulo. */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function porExtenso(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export default function ModalVisaoGerencial({ aberto, onClose }: Props) {
  const { refDialogo, propsDialogo } = useModalDialog(aberto, onClose, 'titulo-visao-gerencial')
  const r = useResumoGerencial(aberto)
  const glosaCodigos = useGlosaCodigos()
  const [montado, setMontado] = useState(false)

  useEffect(() => setMontado(true), [])
  if (!aberto || !montado) return null

  const visual = KPI_VISUAL[r.metrica as MetricaKpi] ?? KPI_VISUAL.glosas
  const totalNoFoco = r.totais[r.metrica]
  const totalSessoes = r.totais.total + r.totais.faltas + r.totais.faltas_terapeuta

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex h-[94dvh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Carga, erro e contagem por aria-live: os números trocam em silêncio
            quando se muda o intervalo ou a métrica. O PRODUCT.md exige. */}
        <p className="sr-only" role="status" aria-live="polite">
          {r.carregando
            ? 'Calculando o resumo do período.'
            : r.erro
              ? r.erro
              : `${totalNoFoco} em ${visual.title.replace('\n', ' ')} entre ${porExtenso(r.de)} e ${porExtenso(r.ate)}, sobre ${totalSessoes} sessões em ${r.diasComDados} dia(s).`}
        </p>

        {/* ── Cabeçalho ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-4 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5">
          <div>
            <h2
              id="titulo-visao-gerencial"
              className="flex items-center gap-2 text-lg font-semibold text-slate-900"
            >
              <ChartColumn size={19} className="text-brand" />
              Visão gerencial do período
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Os mesmos indicadores do dia, somados no intervalo que você escolher.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Intervalo + frescor ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-end sm:gap-5 sm:px-8 sm:py-4">
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">De</span>
              <input
                type="date"
                value={r.de}
                max={r.ate}
                onChange={(e) => r.setDe(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">Até</span>
              <input
                type="date"
                value={r.ate}
                min={r.de}
                onChange={(e) => r.setAte(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </label>
          </div>

          {/* A busca fica na mesma faixa do intervalo porque é do mesmo tipo:
              recorta O QUE está sendo somado. Ela filtra em memória, sobre as
              linhas do período já carregadas — então responde a cada tecla sem
              ida ao banco, e todo o resto do modal (totais, gráfico e as quatro
              quebras) passa a falar do paciente buscado. */}
          <label className="relative flex-1 sm:max-w-64">
            <span className="sr-only">Buscar paciente pelo nome</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={r.busca}
              onChange={(e) => r.setBusca(e.target.value)}
              placeholder="Buscar paciente"
              className="h-11 w-full rounded-xl border border-slate-200 pr-3 pl-10 text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </label>

          <div className="flex flex-1 items-center justify-between gap-3 sm:justify-end">
            <p className="text-xs text-slate-500">
              {r.carregando
                ? 'calculando…'
                : `${totalSessoes} sessões · ${r.diasComDados} dia${r.diasComDados === 1 ? '' : 's'} com movimento`}
              {!r.carregando && r.busca.trim() && (
                <> · {r.pacientesEncontrados} paciente{r.pacientesEncontrados === 1 ? '' : 's'}</>
              )}
              {r.atualizadoEm && !r.carregando && (
                <>
                  {' · '}
                  <span title="Os números são pré-calculados a cada 15 minutos, para a tela abrir sem pesar no banco.">
                    atualizado {new Date(r.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              )}
            </p>
            <button
              onClick={r.recarregar}
              disabled={r.carregando}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50"
            >
              <RefreshCw size={14} className={r.carregando ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        {/* ── Os nove indicadores, que também escolhem o foco ──────────── */}
        <div className="border-t border-slate-100 px-4 py-3 sm:px-8">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {ORDEM_KPIS.map((metrica) => (
              <CardMetrica
                key={metrica}
                metrica={metrica}
                valor={r.totais[metrica]}
                total={totalSessoes}
                carregando={r.carregando}
                ativo={r.metrica === metrica}
                onSelecionar={() => r.setMetrica(metrica)}
              />
            ))}
          </div>
        </div>

        {/* ── Evolução + quebras ───────────────────────────────────────── */}
        {/* `bg-slate-50` sem modificador de opacidade, de propósito: o shim do
            tema escuro casa com `.dark .bg-slate-50`, e esse seletor NÃO pega a
            classe gerada por `bg-slate-50/60` — a faixa inteira ficava clara no
            escuro, calada. Mesma classe que o ModalTokenMensal usa. */}
        <div className="flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-8">
          {r.erro ? (
            <EstadoVazio
              titulo="Não foi possível carregar o resumo"
              detalhe={r.erro}
            />
          ) : r.carregando ? (
            <EstadoVazio titulo="Calculando…" detalhe="Somando os dias do intervalo." />
          ) : r.linhas.length === 0 ? (
            // Busca vazia e intervalo vazio são coisas diferentes, e dizer a
            // frase errada manda a pessoa procurar o problema no lugar errado.
            r.busca.trim() ? (
              <EstadoVazio
                titulo={`Nenhum paciente com "${r.busca.trim()}" no intervalo`}
                detalhe="A busca é pelo nome como ele aparece na agenda. Limpe o campo para ver o período inteiro."
              />
            ) : (
              <EstadoVazio
                titulo="Nenhuma sessão no intervalo"
                detalhe="Não há movimento registrado entre estas datas. Se o período for muito antigo, ele pode ainda não ter sido pré-calculado."
              />
            )
          ) : (
            <div className="flex flex-col gap-4">
              <Evolucao
                serie={r.serie}
                metrica={r.metrica}
                diaria={r.serieDiaria}
                barTone={visual.barTone}
                titulo={visual.title.replace('\n', ' ')}
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <Quebra
                  titulo="Por paciente"
                  fatias={r.porPaciente}
                  metrica={r.metrica}
                  barTone={visual.barTone}
                  vazio="Nenhum paciente com este indicador no período."
                />
                <Quebra
                  titulo="Por terapia"
                  fatias={r.porTerapia}
                  metrica={r.metrica}
                  barTone={visual.barTone}
                  vazio="Nenhuma terapia com este indicador no período."
                />
                <Quebra
                  titulo="Por motivo de glosa"
                  fatias={r.porMotivo.map((f) => ({
                    ...f,
                    // O código sozinho ("1013") não diz nada a quem contesta, e
                    // o texto sozinho não é o que se cita na contestação — os
                    // dois juntos, então. O extenso vem do de-para que o sistema
                    // aprende sozinho; enquanto ele não conhece o código, mostra
                    // o código puro em vez de inventar rótulo.
                    rotulo:
                      f.chave === '—'
                        ? 'Sem código'
                        : glosaCodigos.get(f.chave)
                          ? `${f.chave} · ${glosaCodigos.get(f.chave)}`
                          : f.chave,
                  }))}
                  metrica={r.metrica}
                  barTone={visual.barTone}
                  vazio="Nenhuma recusa com código no período."
                />
                <Quebra
                  titulo="Por unidade"
                  fatias={r.porUnidade}
                  metrica={r.metrica}
                  barTone={visual.barTone}
                  vazio="Sem unidade identificada no período."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * O card de um indicador no modal.
 *
 * As classes de cor vêm inteiras de `KPI_VISUAL` — o mesmo mapa que desenha os
 * cards da tela diária. O layout é mais compacto aqui (nove cards convivendo
 * com gráfico e quebras na mesma altura de tela), mas o vocabulário é o mesmo:
 * quem reconhece o violeta de Glosas no dia reconhece no mês.
 */
function CardMetrica({
  metrica, valor, total, carregando, ativo, onSelecionar,
}: {
  metrica: MetricaKpi
  valor: number
  total: number
  carregando: boolean
  ativo: boolean
  onSelecionar: () => void
}) {
  const visual = KPI_VISUAL[metrica]
  const Icon = visual.icon
  const percent = total > 0 ? Math.round((valor / total) * 100) : 0

  return (
    <button
      onClick={onSelecionar}
      aria-pressed={ativo}
      className={`
        flex w-full flex-col items-center rounded-xl border-2 p-1.5 text-left shadow-sm transition
        hover:-translate-y-px hover:shadow-md
        focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none
        ${ativo ? `${visual.borderActive} ${visual.bgActive}` : `border-slate-200/80 bg-white ${visual.hoverBorder}`}
      `}
    >
      <div className={`flex h-7 w-7 items-center justify-center rounded-full ${visual.iconTone}`}>
        <Icon size={13} />
      </div>
      <p className="mt-1.5 text-center text-[11px] leading-snug font-semibold whitespace-pre-line text-slate-600">
        {visual.title}
      </p>
      <span className={`mt-1 text-2xl leading-none font-bold ${visual.tone}`}>
        {carregando ? '—' : valor}
      </span>
      <div className="mt-1.5 w-full px-1">
        <div className="h-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${visual.barTone}`}
            style={{ width: `${carregando ? 0 : percent}%` }}
          />
        </div>
      </div>
    </button>
  )
}

/**
 * A evolução do indicador em foco, em colunas de HTML.
 *
 * Não é Recharts de propósito. O shim global de tema escuro remapeia `bg-`,
 * `text-`, `border-` e `ring-`, mas NÃO `fill-` — uma barra de SVG pintada por
 * classe utilitária continuaria clara no escuro, calada. Em HTML a mesma barra
 * usa `bg-*` e acompanha o tema como todo o resto da tela.
 *
 * Uma série só, então não há legenda: o título nomeia o que está desenhado. O
 * valor não é impresso em cima de toda coluna — só o maior ganha rótulo, e o
 * resto sai no hover e no `title`.
 */
function Evolucao({
  serie, metrica, diaria, barTone, titulo,
}: {
  serie: FatiaKpis[]
  metrica: MetricaFoco
  diaria: boolean
  barTone: string
  titulo: string
}) {
  const maximo = Math.max(1, ...serie.map((f) => f.kpis[metrica]))
  // Com muitas colunas, rotular todas colide. Um rótulo a cada N mantém o eixo
  // legível sem esconder a escala.
  const passo = Math.ceil(serie.length / 12)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {titulo} {diaria ? 'por dia' : 'por semana'}
        </h3>
        <span className="text-xs text-slate-500">pico de {maximo}</span>
      </div>

      <div className="flex h-40 items-end gap-1 overflow-x-auto">
        {serie.map((fatia, i) => {
          const valor = fatia.kpis[metrica]
          const altura = (valor / maximo) * 100
          const rotulo = diaria ? diaMes(fatia.chave) : `sem. ${diaMes(fatia.chave)}`
          return (
            <div key={fatia.chave} className="group flex min-w-6 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-700 opacity-0 transition group-hover:opacity-100">
                {valor}
              </span>
              <div className="flex h-28 w-full items-end">
                <div
                  className={`w-full rounded-t-lg transition-all ${valor > 0 ? barTone : 'bg-slate-200'}`}
                  style={{ height: `${valor > 0 ? Math.max(altura, 3) : 2}%` }}
                  title={`${rotulo}: ${valor}`}
                />
              </div>
              <span className="text-[9px] whitespace-nowrap text-slate-400">
                {i % passo === 0 ? rotulo : ''}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Uma quebra do indicador em foco, do maior ofensor para o menor. */
function Quebra({
  titulo, fatias, metrica, barTone, vazio,
}: {
  titulo: string
  fatias: FatiaKpis[]
  metrica: MetricaFoco
  barTone: string
  vazio: string
}) {
  const maximo = Math.max(1, ...fatias.map((f) => f.kpis[metrica]))

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{titulo}</h3>
      {fatias.length === 0 ? (
        <p className="text-xs text-slate-400">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fatias.slice(0, 8).map((fatia) => {
            const valor = fatia.kpis[metrica]
            return (
              <li key={fatia.chave} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-slate-700" title={fatia.rotulo}>
                    {fatia.rotulo}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-slate-900">{valor}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${barTone}`}
                    style={{ width: `${(valor / maximo) * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function EstadoVazio({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      <p className="max-w-md text-xs text-slate-500">{detalhe}</p>
    </div>
  )
}
