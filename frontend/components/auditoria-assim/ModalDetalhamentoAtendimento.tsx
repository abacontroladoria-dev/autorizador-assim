'use client'

import { useEffect, useState } from 'react'
import {
  AlertOctagon,
  Calendar,
  CalendarCheck,
  Clock,
  CreditCard,
  FileText,
  Hash,
  KeySquare,
  Layers,
  Loader2,
  MessageSquare,
  Save,
  Send,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { salvarMotivoGlosa, salvarObservacaoManual } from '@/services/auditoria-assim.service'
import type { AuditoriaAssimItem } from './types'
import SituacaoBadge, { SITUACAO_CONFIG } from './SituacaoBadge'

type Props = {
  item: AuditoriaAssimItem | null
  open: boolean
  onClose: () => void
  onSalvo: () => void
}

function formatarData(data: string | null) {
  if (!data) return null
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function formatarDataHora(data: string | null) {
  if (!data) return null
  const d = new Date(data)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Ficha compacta: uma célula de fato (rótulo + valor), não uma linha de lista. */
function Fact({
  icon: Icon,
  label,
  value,
  mono,
  full,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: React.ReactNode
  mono?: boolean
  full?: boolean
  tone?: string
}) {
  return (
    <div className={`rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 ${full ? 'col-span-2' : ''}`}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon size={11} className="shrink-0" />
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-medium leading-snug wrap-break-word ${mono ? 'font-mono tabular-nums text-[13px]' : ''} ${tone ?? 'text-slate-800'}`}
      >
        {value ?? <span className="font-normal text-slate-300">—</span>}
      </dd>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
      {children}
    </h3>
  )
}

export default function ModalDetalhamentoAtendimento({ item, open, onClose, onSalvo }: Props) {
  const [motivo, setMotivo] = useState('')
  const [salvandoMotivo, setSalvandoMotivo] = useState(false)

  const [observacao, setObservacao] = useState('')
  const [salvandoObservacao, setSalvandoObservacao] = useState(false)

  const soLeituraGlosa = Boolean(item?.motivo_glosa)

  useEffect(() => {
    if (open && item) {
      setMotivo(item.motivo_glosa ?? '')
      setObservacao(item.observacao_manual ?? '')
    }
  }, [open, item])

  if (!open || !item) return null

  async function handleSalvarMotivo() {
    if (!item?.bloco_id || !motivo.trim()) return
    setSalvandoMotivo(true)
    try {
      await salvarMotivoGlosa(item.bloco_id, motivo.trim())
      onSalvo()
    } catch {
      toast.error('Erro ao salvar motivo da glosa. Tente novamente.')
    } finally {
      setSalvandoMotivo(false)
    }
  }

  async function handleSalvarObservacao() {
    if (!item?.bloco_id) return
    setSalvandoObservacao(true)
    try {
      await salvarObservacaoManual(item.bloco_id, observacao)
      toast.success('Observação salva.')
      onSalvo()
    } catch {
      toast.error('Erro ao salvar observação. Tente novamente.')
    } finally {
      setSalvandoObservacao(false)
    }
  }

  const atualizadoObservacao = formatarDataHora(item.observacao_manual_atualizado_em)
  const corSituacao = (item.situacao && SITUACAO_CONFIG[item.situacao]?.dot) || 'bg-slate-400'
  const temErro = Boolean(item.codigo_erro || item.descricao_erro)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex max-h-[90vh] w-full max-w-160 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lombada colorida — leitura de severidade antes de qualquer texto */}
        <div className={`h-1 shrink-0 ${corSituacao}`} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {item.paciente_nome ?? 'Detalhamento do atendimento'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{item.terapias ?? 'Sem terapia'}</p>
            <div className="mt-2">
              <SituacaoBadge situacao={item.situacao} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-t border-slate-100" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Sessão */}
          <section>
            <SectionTitle>Sessão</SectionTitle>
            <dl className="grid grid-cols-2 gap-2">
              <Fact icon={Calendar} label="Data" value={formatarData(item.data_atendimento)} />
              <Fact icon={Clock} label="Hora" value={item.hora_inicial ? item.hora_inicial.slice(0, 5) : null} />
              <Fact icon={Hash} label="Código TUSS" value={item.codigo_tuss} mono />
              <Fact icon={Layers} label="Qtd. sessões" value={item.quantidade_sessoes} mono />
              <Fact icon={Users} label="Profissional" value={item.profissionais} full />
            </dl>
          </section>

          {/* Autorização ASSIM — grade + rodapé de retorno, um único bloco */}
          <section>
            <SectionTitle>Autorização ASSIM</SectionTitle>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <dl className="grid grid-cols-2 gap-2 p-2">
                <Fact icon={FileText} label="Guia" value={item.guia} mono />
                <Fact icon={CreditCard} label="Convênio" value={item.convenio_nome} />
                <Fact icon={User} label="Solicitado por" value={item.criado_por} />
                <Fact icon={Send} label="Forma" value={item.forma_autorizacao} />
                <Fact icon={Clock} label="Autorizado em" value={formatarDataHora(item.horario_autorizacao)} />
                <Fact icon={CalendarCheck} label="Executado em" value={formatarDataHora(item.data_execucao)} />
                {item.teve_token && <Fact icon={KeySquare} label="Token" value={item.token} mono />}
                {item.teve_token && (
                  <Fact
                    icon={ShieldCheck}
                    label="Filipeta conferida"
                    value={
                      item.token_conferido
                        ? `Sim${item.token_conferido_por_nome ? ` · ${item.token_conferido_por_nome}` : ''}`
                        : 'Ainda não'
                    }
                    tone={item.token_conferido ? 'text-emerald-700' : 'text-amber-600'}
                  />
                )}
              </dl>

              {(item.status_assim || temErro || item.observacao) && (
                <div
                  className={`flex items-start gap-2 border-t px-3 py-2.5 text-xs ${
                    temErro
                      ? 'border-rose-100 bg-rose-50 text-rose-700'
                      : 'border-slate-100 bg-slate-50 text-slate-500'
                  }`}
                >
                  {temErro ? (
                    <AlertOctagon size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-400" />
                  )}
                  <span>
                    {item.status_assim && <span className="font-semibold">{item.status_assim} — </span>}
                    {item.codigo_erro && <span className="font-semibold">{item.codigo_erro}: </span>}
                    {item.descricao_erro || item.observacao}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Motivo da glosa — só para linhas GLOSA */}
          {item.situacao === 'GLOSA' && (
            <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-violet-900">
                <AlertOctagon size={14} />
                Motivo da glosa
              </h3>

              {soLeituraGlosa ? (
                <p className="text-sm whitespace-pre-wrap text-violet-900">{item.motivo_glosa}</p>
              ) : (
                <>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value.slice(0, 1000))}
                    placeholder="Ex.: Beneficiário inativo — carteirinha vencida em 15/08."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <div className="mt-1.5 mb-2 flex justify-between">
                    <span className="text-xs text-slate-400">Campo obrigatório.</span>
                    <span className="text-xs text-slate-400">{motivo.length} / 1000</span>
                  </div>
                  <button
                    onClick={handleSalvarMotivo}
                    disabled={salvandoMotivo || !motivo.trim()}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvandoMotivo ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {salvandoMotivo ? 'Salvando...' : 'Salvar motivo'}
                  </button>
                </>
              )}
            </section>
          )}

          {/* Observações — livre, qualquer status, sempre editável */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <MessageSquare size={14} />
              Observações
            </h3>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value.slice(0, 1000))}
              placeholder="Registre um lembrete ou combinado sobre este atendimento."
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-700 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <div className="mt-1.5 mb-2 flex justify-between gap-4">
              <span className="truncate text-xs text-slate-400">
                {item.observacao_manual_atualizado_por_nome && atualizadoObservacao
                  ? `Atualizado por ${item.observacao_manual_atualizado_por_nome} em ${atualizadoObservacao}`
                  : ''}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{observacao.length} / 1000</span>
            </div>
            <button
              onClick={handleSalvarObservacao}
              disabled={salvandoObservacao || observacao.trim() === (item.observacao_manual ?? '')}
              className="flex items-center gap-2 rounded-xl bg-brand-fg px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvandoObservacao ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {salvandoObservacao ? 'Salvando...' : 'Salvar observação'}
            </button>
          </section>

        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
