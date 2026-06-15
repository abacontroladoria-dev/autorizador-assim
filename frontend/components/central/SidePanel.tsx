'use client'

import { memo, useEffect, useState } from 'react'
import { Repeat2, ChevronDown, RotateCcw } from 'lucide-react'

import Timeline from './Timeline'
import StatusBadge from './StatusBadge'
import { ReverteFaltaModal } from './ReverteFaltaModal'
import { Button } from '@/components/ui/button'
import { buscarLogsFila } from '@/services/logs.service'
import {
  resolverStatus,
  SEVERIDADE_UI,
  realizouPor,
  houveSubstituicao,
} from '@/lib/central/severity'

interface Props {
  atendimento: any
  onReverterFalta?: (atendimento: any) => Promise<void>
}

/** Frase de situação por severidade — o coração da ficha. */
function fraseSituacao(item: any): string {
  const token = resolverStatus(item)
  switch (token.key) {
    case 'autorizado':
      return 'Atendimento autorizado. Nenhuma ação necessária.'
    case 'falta_terapeuta':
      return 'Terapeuta não compareceu. Verifique cobertura.'
    case 'falta_paciente':
      return 'Paciente faltou. Avaliar remarcação.'
    case 'erro':
      return 'Atendimento sem autorização. Requer ação manual.'
    case 'processando':
      return 'Autorização em processamento pelo sistema.'
    case 'concluido_sem_guia':
      return 'Concluído, aguardando guia do convênio.'
    case 'pendente':
      return 'Aguardando processamento.'
    default:
      return token.label
  }
}

function SidePanel({ atendimento, onReverterFalta }: Props) {
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsAbertos, setLogsAbertos] = useState(false)
  const [modalReverterAberto, setModalReverterAberto] = useState(false)
  const [loadingReverter, setLoadingReverter] = useState(false)

  useEffect(() => {
    async function carregarLogs() {
      if (!atendimento?.id) {
        setLogs([])
        return
      }
      setLoadingLogs(true)
      const response = await buscarLogsFila(atendimento.id)
      setLogs(response || [])
      setLoadingLogs(false)
    }
    carregarLogs()
  }, [atendimento?.id])

  const handleReverterConfirm = async () => {
    if (!onReverterFalta) return
    try {
      setLoadingReverter(true)
      await onReverterFalta(atendimento)
    } finally {
      setLoadingReverter(false)
      setModalReverterAberto(false)
    }
  }

  if (!atendimento) {
    return (
      <div className="sticky top-0 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-500">Nenhum atendimento</p>
        <p className="text-xs text-slate-400 mt-1">
          Selecione uma linha para ver a ficha operacional.
        </p>
      </div>
    )
  }

  const token = resolverStatus(atendimento)
  const ui = SEVERIDADE_UI[token.severidade]
  const realizou = realizouPor(atendimento)
  const subbed = houveSubstituicao(atendimento)

  const unidade =
    atendimento.unidade?.replace('Unid. ', '')?.split(' - ')[0] ||
    atendimento.sala_nome?.replace('Unid. ', '')?.split(' - ')[0]

  const horarioFim = atendimento.hora_final?.slice(0, 5)
  const horarioIni =
    atendimento.horario?.slice(0, 5) || atendimento.hora_inicial?.slice(0, 5)

  return (
    <div className="sticky top-0 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
      {/* CABEÇALHO */}
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-xl font-semibold leading-tight text-slate-900">
          {atendimento.paciente_nome}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {atendimento.classificacao_terapia ||
            atendimento.terapia_nome ||
            'Sem terapia'}
        </p>
        <div className="mt-3">
          <StatusBadge item={atendimento} variant="pill" />
        </div>
      </div>

      {/* SITUAÇÃO ATUAL */}
      <div className={`px-5 py-4 ${ui.soft} border-b border-slate-100`}>
        <SectionTitle>Situação atual</SectionTitle>
        <p className={`text-sm font-medium ${ui.text}`}>{fraseSituacao(atendimento)}</p>
        {atendimento.status_operacional === 'falta_paciente' && onReverterFalta && (
          <Button
            size="sm"
            onClick={() => setModalReverterAberto(true)}
            className="mt-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Reverter falta
          </Button>
        )}
      </div>

      <div className="p-5 space-y-6">
        {/* AUTORIZAÇÃO */}
        <section>
          <SectionTitle>Autorização</SectionTitle>
          <dl className="space-y-2.5">
            <Row label="Guia" value={atendimento.numero_autorizacao} mono />
            <Row label="Solicitado por" value={atendimento.criado_por} />
            <Row label="Forma" value={atendimento.forma_autorizacao} />
            <Row
              label="Convênio"
              value={atendimento.convenio || atendimento.convenio_nome}
            />
            <Row
              label="Autorizado em"
              value={
                atendimento.horario_autorizacao
                  ? new Date(atendimento.horario_autorizacao).toLocaleTimeString(
                      'pt-BR',
                      { hour: '2-digit', minute: '2-digit' }
                    )
                  : null
              }
            />
          </dl>
        </section>

        {/* ATENDIMENTO */}
        <section>
          <SectionTitle>Atendimento</SectionTitle>
          <dl className="space-y-2.5">
            <Row label="Agendado" value={atendimento.profissional_nome} />
            <Row
              label="Realizado por"
              value={
                realizou ? (
                  <span className="inline-flex items-center gap-1.5">
                    {realizou}
                    {subbed && (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        <Repeat2 className="w-3 h-3" /> substituto
                      </span>
                    )}
                  </span>
                ) : null
              }
            />
            <Row
              label="Horário"
              value={
                horarioIni
                  ? horarioFim
                    ? `${horarioIni}–${horarioFim}`
                    : horarioIni
                  : null
              }
            />
            <Row label="Unidade" value={unidade} />
            <Row
              label="Confirmado em"
              value={
                atendimento.confirmado_em
                  ? new Date(atendimento.confirmado_em).toLocaleTimeString(
                      'pt-BR',
                      { hour: '2-digit', minute: '2-digit' }
                    )
                  : null
              }
            />
          </dl>
        </section>

        {/* TIMELINE */}
        <section>
          <SectionTitle>Linha do tempo</SectionTitle>
          {loadingLogs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <Timeline logs={logs} />
          )}
        </section>

        {/* LOGS TÉCNICOS — colapsados */}
        {logs.length > 0 && (
          <section>
            <button
              onClick={() => setLogsAbertos((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <SectionTitle className="mb-0">
                Logs técnicos · {logs.length}
              </SectionTitle>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  logsAbertos ? 'rotate-180' : ''
                }`}
              />
            </button>
            {logsAbertos && (
              <div className="mt-3 space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"
                  >
                    <span className="text-slate-700">{log.descricao}</span>
                    {log.erro && (
                      <span className="block text-rose-600 mt-1">{log.erro}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <ReverteFaltaModal
        open={modalReverterAberto}
        atendimento={atendimento}
        onCancel={() => setModalReverterAberto(false)}
        onConfirm={handleReverterConfirm}
        loading={loadingReverter}
      />
    </div>
  )
}

function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3
      className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3 ${className}`}
    >
      {children}
    </h3>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-slate-400 shrink-0">{label}</dt>
      <dd
        className={`text-sm text-right text-slate-700 wrap-break-word ${
          mono ? 'tabular-nums' : ''
        }`}
      >
        {value || <span className="text-slate-300">—</span>}
      </dd>
    </div>
  )
}

export default memo(SidePanel)
