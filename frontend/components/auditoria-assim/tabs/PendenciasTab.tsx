'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Inbox, PlayCircle, Plus, RefreshCw } from 'lucide-react'

import { useAlertas } from '@/hooks/useAlertas'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import AlertaDetalhe from '@/components/alertas/AlertaDetalhe'
import TabelaPendencias from '@/components/alertas/TabelaPendencias'
import NovaPendenciaModal from '@/components/auditoria-assim/NovaPendenciaModal'
import type { Alerta, AlertaStatus } from '@/components/alertas/types'

const ROLES_GESTAO = ['admin', 'diretoria', 'autorizacao']

type FiltroStatus = 'abertos' | AlertaStatus

const FILTROS: { key: FiltroStatus; label: string }[] = [
  { key: 'abertos',      label: 'Pendentes' },
  { key: 'aberto',       label: 'Abertas' },
  { key: 'em_andamento', label: 'Em andamento' },
  // "Conferidas", não "Resolvidas": é o vocabulário da planilha que ela usa hoje.
  { key: 'resolvido',    label: 'Conferidas' },
]

/**
 * Aba Pendências — o workflow operacional por exceção.
 *
 * Ao contrário da aba Auditoria (que lista o dia inteiro para conferência), aqui
 * só aparece o que precisa de ação. Os alertas de origem 'sistema' são gerados
 * por fn_alertas_avaliar_assim (cron a cada 10 min) e encerrados pela mesma
 * função quando o atendimento recebe desfecho — autorização capturada pelo robô,
 * falta, cancelamento, ou a sessão sair da agenda.
 */
export default function PendenciasTab() {
  const searchParams = useSearchParams()
  const alertaIdUrl = searchParams.get('alerta')

  const { effectiveRole } = useImpersonation()
  const gestao = !!effectiveRole && ROLES_GESTAO.includes(effectiveRole)

  const [filtro, setFiltro] = useState<FiltroStatus>('abertos')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const { alertas, contadores, loading, recarregar } = useAlertas('assim', filtro)

  // Deep-link do sino: ?alerta=<id> abre a pendência direto.
  useEffect(() => {
    if (alertaIdUrl) setSelecionadoId(alertaIdUrl)
  }, [alertaIdUrl])

  const selecionado: Alerta | null = useMemo(() => {
    if (!alertas.length) return null
    return alertas.find((a) => a.id === selecionadoId) ?? null
  }, [alertas, selecionadoId])

  // Se o alerta selecionado sai da lista (foi resolvido e o filtro é 'abertos',
  // ou o cron encerrou), limpa a seleção em vez de deixar o painel preso num
  // registro que não está mais visível.
  useEffect(() => {
    if (selecionadoId && !loading && !selecionado) setSelecionadoId(null)
  }, [selecionadoId, selecionado, loading])

  return (
    <div className="flex flex-col gap-4">

      {/* FAIXA DE COMPLETUDE — a razão de existir é dar à Luana a certeza de que
          "conferiu tudo". Uma tabela vazia é ambígua: não distingue "fechei as 12"
          de "nunca teve nada" nem de "falhou ao carregar". A faixa afirma o estado
          e mostra o trabalho do dia. */}
      <FaixaCompletude
        pendentes={contadores.total_pendente}
        conferidasHoje={contadores.conferidas_hoje}
        loading={loading}
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          label="Pendentes"
          value={contadores.total_pendente}
          loading={loading}
          icon={Inbox}
          tone="bg-indigo-50 text-indigo-600"
          ativo={filtro === 'abertos'}
          onClick={() => setFiltro('abertos')}
        />
        <Kpi
          label="Abertas"
          value={contadores.abertos}
          loading={loading}
          icon={AlertCircle}
          tone="bg-red-50 text-red-600"
          ativo={filtro === 'aberto'}
          onClick={() => setFiltro('aberto')}
        />
        <Kpi
          label="Em andamento"
          value={contadores.em_andamento}
          loading={loading}
          icon={PlayCircle}
          tone="bg-blue-50 text-blue-600"
          ativo={filtro === 'em_andamento'}
          onClick={() => setFiltro('em_andamento')}
        />
        <Kpi
          label="Prioridade alta"
          value={contadores.criticos}
          loading={loading}
          icon={CheckCircle2}
          tone="bg-orange-50 text-orange-600"
        />
      </section>

      {/* Filtros + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={`
                rounded-xl px-3 py-1.5 text-xs font-semibold transition
                ${filtro === f.key
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => recarregar(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>

          {/* Só gestão cria manualmente. fn_alerta_criar também valida o role —
              este gate é UX, não segurança. */}
          {gestao && (
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              <Plus size={13} />
              Nova pendência
            </button>
          )}
        </div>
      </div>

      {/* Tabela densa (formato da planilha) + ficha do atendimento.
          A ficha só ocupa espaço quando há linha selecionada — assim a tabela usa
          a largura toda para varredura, que é como a Luana trabalha hoje. */}
      <div
        className={`grid grid-cols-1 items-start gap-4 ${
          selecionado ? 'xl:grid-cols-[minmax(0,1fr)_26rem]' : ''
        }`}
      >
        <TabelaPendencias
          alertas={alertas}
          loading={loading}
          selecionadoId={selecionadoId}
          onSelecionar={setSelecionadoId}
        />

        {selecionado && (
          <AlertaDetalhe alerta={selecionado} onMudou={() => recarregar(true)} />
        )}
      </div>

      <NovaPendenciaModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onCriado={() => recarregar(true)}
      />
    </div>
  )
}

function FaixaCompletude({
  pendentes, conferidasHoje, loading,
}: { pendentes: number; conferidasHoje: number; loading?: boolean }) {
  if (loading) {
    return <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
  }

  const tudoConferido = pendentes === 0

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
        tudoConferido
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          tudoConferido ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {tudoConferido ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${tudoConferido ? 'text-emerald-900' : 'text-amber-900'}`}>
          {tudoConferido
            ? 'Tudo conferido — nenhuma pendência em aberto'
            : `${pendentes} pendência${pendentes > 1 ? 's' : ''} aguardando ação`}
        </p>
        <p className={`mt-0.5 text-xs ${tudoConferido ? 'text-emerald-700' : 'text-amber-700'}`}>
          {conferidasHoje > 0
            ? `${conferidasHoje} conferida${conferidasHoje > 1 ? 's' : ''} hoje.`
            : 'Nenhuma conferida hoje.'}
          {tudoConferido
            ? ' Todo atendimento agendado tem guia válida, falta ou cancelamento.'
            : ' O sistema encerra sozinho quando a guia ou a falta aparecer.'}
        </p>
      </div>
    </div>
  )
}

function Kpi({
  label, value, loading, icon: Icon, tone, ativo, onClick,
}: {
  label: string
  value: number
  loading?: boolean
  icon: typeof Inbox
  tone: string
  ativo?: boolean
  onClick?: () => void
}) {
  const clicavel = typeof onClick === 'function'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clicavel}
      className={`
        flex items-center gap-3 rounded-xl border-2 bg-white p-3 text-left transition
        ${ativo ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200/80'}
        ${clicavel ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}
      `}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-slate-500">{label}</span>
        <span className="block text-xl font-bold leading-tight text-slate-800">
          {loading ? '—' : value}
        </span>
      </span>
    </button>
  )
}
