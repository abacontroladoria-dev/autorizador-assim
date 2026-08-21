'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle, Ban, CheckCircle2, Link2, Loader2, RefreshCw, Search, X,
} from 'lucide-react'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import { useReconciliacaoAssim, JANELA_PADRAO } from '@/hooks/useReconciliacaoAssim'
import SituacaoBadge from '../SituacaoBadge'
import ModalConfirmarVinculo from '../ModalConfirmarVinculo'
import type { CandidataVinculo, GuiaOrfa } from '../types'

/** Os papéis que a RPC aceita para escrever. `diretoria` vê, mas não vincula. */
const PAPEIS_QUE_VINCULAM = new Set(['admin', 'autorizacao', 'recepcao'])

function dataHora(valor: string | null) {
  if (!valor) return '—'
  const [data, hora] = valor.split('T')
  const [a, m, d] = data.split('-')
  return `${d}/${m}/${a} ${(hora ?? '').slice(0, 5)}`
}

function dia(valor: string | null) {
  if (!valor) return '—'
  const [a, m, d] = valor.split('-')
  return `${d}/${m}`
}

/** "2 de 1 sessão" é a explicação inteira de por que a guia sobrou. */
function porqueSobrou(g: GuiaOrfa) {
  const n = g.sessoes_na_particao ?? 0
  if (n === 0) return 'nenhuma sessão desse TUSS no dia da autorização'
  return `${g.ordem_autorizacao}ª autorização do dia, com ${n} ${n === 1 ? 'sessão' : 'sessões'}`
}

function CartaoGuia({
  guia, selecionada, onSelecionar,
}: {
  guia: GuiaOrfa
  selecionada: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-pressed={selecionada}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
        selecionada
          ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-slate-900">
          Guia {guia.guia}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500">{dataHora(guia.data_execucao)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        <span>TUSS <span className="tabular-nums text-slate-700">{guia.codigo_tuss}</span></span>
        {guia.teve_token && <span className="text-amber-700">com token</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{porqueSobrou(guia)}</p>
    </button>
  )
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
    <div
      className={`grid grid-cols-1 items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[92px_1fr_180px_150px] ${
        bloqueada ? 'opacity-60' : ''
      }`}
    >
      <div className="text-[13px] font-semibold tabular-nums text-slate-900">
        {dia(c.data_atendimento)}
        <span className="ml-1.5 font-normal text-slate-500">{(c.hora_inicial ?? '').slice(0, 5)}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] text-slate-800">{c.terapias ?? '—'}</p>
        <p className="truncate text-[11px] text-slate-500" title={c.profissionais ?? undefined}>
          {c.profissionais ?? '—'}
        </p>
        {motivo && (
          <p className="mt-0.5 truncate text-[11px] text-violet-700" title={motivo}>{motivo}</p>
        )}
        {c.nota_manual && (
          <p className="mt-0.5 truncate text-[11px] italic text-slate-500" title={c.nota_manual}>
            nota: {c.nota_manual}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <SituacaoBadge situacao={c.situacao} />
        <span className="text-[11px] tabular-nums text-slate-500">
          {c.guia_atual ? `guia ${c.guia_atual}` : 'sem solicitação'}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 size={13} aria-hidden /> Vincular
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Reconciliação de Autorizações — terceira aba do módulo ASSIM.
 *
 * O problema que ela resolve: quando a ASSIM glosa uma solicitação do Pulsar e o
 * setor consegue a liberação depois, direto no portal, o match posicional da
 * Conferência deixa a glosa casada com a sessão e a liberação órfã. A sessão fica
 * GLOSA para sempre e o faturamento vê pendência que não existe.
 *
 * Mestre-detalhe e não tabela única: a decisão é "esta guia cobre qual sessão?",
 * e ela só se toma vendo as duas pontas ao mesmo tempo. Foi medido em produção
 * (2026-08-20) que 39% das órfãs NÃO cobrem sessão nenhuma — são autorizações
 * extras. Por isso "sem sessão correspondente" é uma ação de primeira classe
 * aqui, e não um caso de borda: sem ela essas guias voltariam à fila todo dia.
 */
export default function ReconciliacaoTab() {
  const {
    de, ate, setDe, setAte,
    pacientes, orfas, carregandoOrfas, erroOrfas, recarregarOrfas,
    guiaSelecionada, guiaAtual, selecionarGuia,
    candidatas, carregandoCandidatas, erroCandidatas,
    busca, setBusca,
    salvando, confirmarVinculo, descartarGuia,
  } = useReconciliacaoAssim()

  const { effectiveRole } = useImpersonation()
  const podeVincular = PAPEIS_QUE_VINCULAM.has(effectiveRole ?? '')

  const [modal, setModal] = useState<{ candidata: CandidataVinculo | null } | null>(null)

  const elegiveis = useMemo(() => candidatas.filter((c) => c.elegivel).length, [candidatas])

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de controle */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="flex flex-col">
          <span className="text-[11px] font-medium text-slate-500">De</span>
          <input
            type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[11px] font-medium text-slate-500">Até</span>
          <input
            type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="relative min-w-52 flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Paciente, guia, carteirinha ou TUSS"
            aria-label="Buscar guia órfã"
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-8 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          {busca && (
            <button
              type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button" onClick={() => void recarregarOrfas()} disabled={carregandoOrfas}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={14} className={carregandoOrfas ? 'animate-spin' : ''} aria-hidden />
          Atualizar
        </button>

        <p className="ml-auto text-[12px] text-slate-500" role="status" aria-live="polite">
          {carregandoOrfas
            ? 'carregando…'
            : `${orfas.length} ${orfas.length === 1 ? 'guia sem vínculo' : 'guias sem vínculo'}`}
        </p>
      </div>

      {!podeVincular && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          Seu perfil permite consultar a reconciliação, mas não vincular autorizações.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ESQUERDA — guias sem vínculo, agrupadas por paciente */}
        <section className="rounded-xl border border-slate-200 bg-white" aria-label="Autorizações sem vínculo">
          <header className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-slate-900">Autorizações sem vínculo</h3>
            <p className="text-[11px] text-slate-500">
              Guias liberadas pela ASSIM que sobraram do pareamento da Conferência
            </p>
          </header>

          <div className="max-h-[calc(100dvh-22rem)] overflow-y-auto p-3">
            {erroOrfas && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {erroOrfas}
              </p>
            )}

            {!erroOrfas && carregandoOrfas && (
              <p className="flex items-center gap-2 px-1 py-6 text-[13px] text-slate-500">
                <Loader2 size={15} className="animate-spin" aria-hidden /> Buscando guias órfãs…
              </p>
            )}

            {!erroOrfas && !carregandoOrfas && pacientes.length === 0 && (
              <div className="px-1 py-8 text-center">
                <CheckCircle2 size={22} className="mx-auto text-emerald-500" aria-hidden />
                <p className="mt-2 text-[13px] font-medium text-slate-700">Nada para reconciliar</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {busca
                    ? 'Nenhuma guia bate com a busca.'
                    : 'Toda autorização do período já casou com uma sessão ou já foi triada.'}
                </p>
              </div>
            )}

            {pacientes.map((p) => (
              <div key={p.chave} className="mb-4 last:mb-0">
                <div className="mb-1.5 px-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{p.pacienteNome}</p>
                  <p className="text-[11px] tabular-nums text-slate-500">{p.carteirinha ?? 'sem carteirinha'}</p>
                </div>
                <div className="space-y-1.5">
                  {p.guias.map((g) => (
                    <CartaoGuia
                      key={g.guia}
                      guia={g}
                      selecionada={g.guia === guiaSelecionada}
                      onSelecionar={() => void selecionarGuia(g.guia === guiaSelecionada ? null : g.guia)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DIREITA — candidatas da guia selecionada */}
        <section className="rounded-xl border border-slate-200 bg-white" aria-label="Sessões candidatas">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-slate-900">Sessões candidatas</h3>
              <p className="text-[11px] text-slate-500">
                {guiaAtual
                  ? `Mesmo beneficiário e TUSS ${guiaAtual.codigo_tuss}, até ${JANELA_PADRAO} dias antes da autorização`
                  : 'Selecione uma guia à esquerda'}
              </p>
            </div>
            {guiaAtual && podeVincular && (
              <button
                type="button"
                onClick={() => setModal({ candidata: null })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
              >
                <Ban size={13} aria-hidden /> Sem sessão correspondente
              </button>
            )}
          </header>

          {!guiaAtual && (
            <p className="px-4 py-12 text-center text-[13px] text-slate-500">
              A escolha da sessão é sempre manual — o sistema ordena por relevância, mas não decide.
            </p>
          )}

          {guiaAtual && (
            <>
              {carregandoCandidatas && (
                <p className="flex items-center gap-2 px-4 py-10 text-[13px] text-slate-500">
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Buscando sessões do paciente… isso leva alguns segundos.
                </p>
              )}

              {erroCandidatas && (
                <p role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {erroCandidatas}
                </p>
              )}

              {!carregandoCandidatas && !erroCandidatas && candidatas.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] font-medium text-slate-700">Nenhuma sessão candidata</p>
                  <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
                    Não há sessão desse TUSS para o beneficiário nos {JANELA_PADRAO} dias anteriores
                    à autorização. Costuma ser autorização extra — use
                    “Sem sessão correspondente”.
                  </p>
                </div>
              )}

              {!carregandoCandidatas && candidatas.length > 0 && (
                <>
                  {elegiveis === 0 && (
                    <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      Todas as sessões da janela já estão liberadas ou cobertas. Esta guia
                      provavelmente é uma autorização extra.
                    </p>
                  )}
                  {elegiveis > 1 && (
                    <p className="mx-4 mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                      {elegiveis} sessões elegíveis do mesmo TUSS na janela. Confira data, horário e
                      profissional antes de escolher.
                    </p>
                  )}
                  <div className="mt-2">
                    {candidatas.map((c) => (
                      <LinhaCandidata
                        key={c.bloco_id}
                        c={c}
                        podeVincular={podeVincular}
                        onEscolher={() => setModal({ candidata: c })}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <ModalConfirmarVinculo
        open={modal !== null}
        onClose={() => setModal(null)}
        guia={guiaAtual}
        candidata={modal?.candidata ?? null}
        salvando={salvando}
        onConfirmar={async (observacao) => {
          if (!guiaAtual) return
          if (modal?.candidata) await confirmarVinculo(modal.candidata, observacao)
          else await descartarGuia(guiaAtual.guia, observacao)
          setModal(null)
        }}
      />
    </div>
  )
}
