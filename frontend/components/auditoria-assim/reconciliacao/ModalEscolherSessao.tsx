'use client'

import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, CheckCircle2, Link2, Loader2, X } from 'lucide-react'
import { useModalDialog } from '@/hooks/useModalDialog'
import SituacaoBadge from '../SituacaoBadge'
import type { CandidataVinculo, GuiaOrfa } from '../types'
import { dataHoraCurta, formatarDia } from './datas'

const ID_TITULO = 'titulo-escolher-sessao'

type Props = {
  open: boolean
  onClose: () => void
  guia: GuiaOrfa | null
  candidatas: CandidataVinculo[]
  carregando: boolean
  erro: string | null
  janelaDias: number
  podeVincular: boolean
  onEscolher: (candidata: CandidataVinculo) => void
  onSemSessao: () => void
}

/** "3,2 d antes da sessão" — a distância é o que separa a candidata plausível da coincidência. */
function distancia(horas: number | null) {
  if (horas == null) return null
  const abs = Math.abs(horas)
  const texto = abs < 24 ? `${abs.toFixed(1)} h` : `${Math.floor(abs / 24)} d`
  return horas < 0 ? `${texto} antes da autorização` : `autorização ${texto} depois`
}

function LinhaCandidata({
  c, podeVincular, onEscolher,
}: {
  c: CandidataVinculo
  podeVincular: boolean
  onEscolher: () => void
}) {
  const bloqueada = !c.elegivel
  const motivo = c.motivo_glosa_descricao
    ? `${c.motivo_glosa_codigo ? c.motivo_glosa_codigo + ' · ' : ''}${c.motivo_glosa_descricao}`
    : null

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-3 lg:py-2.5 ${
        bloqueada ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-baseline gap-3 lg:contents">
        <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums lg:w-24">
          {formatarDia(c.data_atendimento)}
          <span className="ml-1.5 font-normal text-slate-500">{(c.hora_inicial ?? '').slice(0, 5)}</span>
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-20">
          {c.codigo_tuss ?? '—'}
        </span>
      </div>

      <div className="min-w-0 lg:flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{c.terapias ?? '—'}</p>
        <p className="truncate text-xs text-slate-500" title={c.profissionais ?? undefined}>
          {c.profissionais ?? '—'}
        </p>
        {motivo && (
          <p className="mt-0.5 truncate text-xs text-violet-700" title={motivo}>{motivo}</p>
        )}
        {c.nota_manual && (
          <p className="mt-0.5 truncate text-xs italic text-slate-500" title={c.nota_manual}>
            nota: {c.nota_manual}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 lg:w-44 lg:shrink-0">
        <SituacaoBadge situacao={c.situacao} />
        <span className="text-[11px] tabular-nums text-slate-500">
          {c.guia_atual ? `guia ${c.guia_atual}` : 'sem solicitação'}
          {c.distancia_horas != null && ` · ${distancia(c.distancia_horas)}`}
        </span>
      </div>

      <div className="flex items-center justify-end lg:w-32 lg:shrink-0">
        {c.ja_vinculado ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 size={13} aria-hidden /> já coberta
          </span>
        ) : bloqueada ? (
          <span className="text-[11px] text-slate-500">já liberada</span>
        ) : (
          <button
            type="button"
            onClick={onEscolher}
            disabled={!podeVincular}
            title={podeVincular ? undefined : 'Seu perfil não permite vincular autorizações'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 size={13} aria-hidden /> Esta sessão
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * "Esta guia cobre qual sessão?" — o primeiro passo do vínculo.
 *
 * Modal, e não um modo dentro da tela, por duas razões. A janela de candidatas
 * é de 7 dias retroativos a partir da autorização, então ela ATRAVESSA a semana
 * exibida: uma guia de segunda cobre sessão da quinta anterior, que não está no
 * cronograma ao fundo. E transformar a coluna da semana em formulário tirava do
 * leitor justamente a evidência que o trouxe até aqui. Aqui as candidatas
 * aparecem todas, com a data real de cada uma, e a semana continua atrás.
 *
 * A escolha é sempre manual: a RPC ordena por relevância, mas não decide.
 */
export default function ModalEscolherSessao({
  open, onClose, guia, candidatas, carregando, erro, janelaDias, podeVincular, onEscolher, onSemSessao,
}: Props) {
  const fechar = useCallback(() => onClose(), [onClose])
  const { refDialogo, propsDialogo } = useModalDialog(open, fechar, ID_TITULO)

  if (!open || !guia) return null

  const elegiveis = candidatas.filter((c) => c.elegivel && !c.ja_vinculado).length

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex max-h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5">
          <div className="min-w-0">
            <h2 id={ID_TITULO} className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Link2 size={19} className="text-brand" />
              Qual sessão a guia {guia.guia} cobre?
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {guia.paciente_nome} · TUSS {guia.codigo_tuss} · autorizada em{' '}
              {dataHoraCurta(guia.data_execucao)} · sessões dos {janelaDias} dias anteriores
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

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-8">
          {carregando && (
            <p className="flex items-center gap-2 py-10 text-[13px] text-slate-500">
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Buscando as sessões do paciente… isso leva alguns segundos.
            </p>
          )}

          {erro && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {erro}
            </p>
          )}

          {!carregando && !erro && candidatas.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhuma sessão candidata</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
                Não há sessão desse TUSS para o beneficiário nos {janelaDias} dias anteriores à
                autorização. Costuma ser autorização extra — use o botão abaixo.
              </p>
            </div>
          )}

          {!carregando && candidatas.length > 0 && (
            <>
              {elegiveis === 0 && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Todas as sessões da janela já estão liberadas ou cobertas. Esta guia provavelmente
                  é autorização extra.
                </p>
              )}
              {elegiveis > 1 && (
                <p className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
                  {elegiveis} sessões elegíveis do mesmo TUSS na janela. Confira data, horário e
                  profissional antes de escolher.
                </p>
              )}
              <ul className="space-y-1.5">
                {candidatas.map((c) => (
                  <LinhaCandidata
                    key={c.bloco_id}
                    c={c}
                    podeVincular={podeVincular}
                    onEscolher={() => onEscolher(c)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Descartar é ação de primeira classe, não caso de borda: 39% das órfãs
            medidas em produção não cobrem sessão nenhuma. Sem esta saída elas
            voltariam à fila todo dia, para sempre. */}
        {podeVincular && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-8">
            <p className="text-[12px] text-slate-500">
              Se a guia não cobre nenhuma sessão, registre isso — ela sai da fila.
            </p>
            <button
              type="button"
              onClick={onSemSessao}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Ban size={13} aria-hidden /> Nenhuma — é autorização extra
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
