'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, PlayCircle, RotateCcw, Send } from 'lucide-react'
import { toast } from 'react-hot-toast'

import Timeline from '@/components/central/Timeline'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import {
  alterarStatusAlerta,
  buscarHistorico,
  comentarAlerta,
} from '@/services/alertas.service'
import OrigemTag from './OrigemTag'
import type { Alerta, AlertaEvento } from './types'

type Props = {
  alerta: Alerta | null
  onMudou: () => void
}

const ROLES_GESTAO = ['admin', 'diretoria', 'autorizacao']

export default function AlertaDetalhe({ alerta, onMudou }: Props) {
  const { effectiveRole } = useImpersonation()
  const gestao = !!effectiveRole && ROLES_GESTAO.includes(effectiveRole)

  const [eventos, setEventos] = useState<AlertaEvento[]>([])
  const [carregandoEventos, setCarregandoEventos] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Dependências por VALOR, não pelo objeto `alerta`: a cada invalidação do
  // realtime o hook refaz a lista e devolve um objeto novo, e depender dele
  // recarregaria o histórico a cada tick sem nada ter mudado. Estes quatro campos
  // cobrem tudo que exige recarga: trocou de atendimento, mudou de status, ou
  // apareceu evento novo (total_eventos).
  const entTipo  = alerta?.entidade_tipo ?? null
  const entId    = alerta?.entidade_id ?? null
  const status   = alerta?.status ?? null
  const nEventos = alerta?.total_eventos ?? 0

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!entTipo || !entId) { setEventos([]); return }
      setCarregandoEventos(true)
      const lista = await buscarHistorico(entTipo, entId)
      if (!ativo) return
      setEventos(lista)
      setCarregandoEventos(false)
    }
    carregar()
    return () => { ativo = false }
  }, [entTipo, entId, status, nEventos])

  if (!alerta) {
    return (
      <div className="sticky top-0 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-500">Nenhuma pendência selecionada</p>
        <p className="mt-1 text-xs text-slate-400">
          Escolha uma pendência na lista para ver detalhes e histórico.
        </p>
      </div>
    )
  }

  const ref = alerta.entidade_ref ?? {}
  const resolvido = alerta.status === 'resolvido'

  async function recarregarHistorico() {
    const lista = await buscarHistorico(alerta!.entidade_tipo, alerta!.entidade_id)
    setEventos(lista)
  }

  async function enviarComentario() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await comentarAlerta(alerta!.id, texto.trim())
      setTexto('')
      await recarregarHistorico()
      onMudou()
    } catch (e) {
      toast.error(mensagemErro(e, 'Erro ao comentar.'))
    } finally {
      setEnviando(false)
    }
  }

  async function mudarStatus(status: 'aberto' | 'em_andamento' | 'resolvido') {
    setEnviando(true)
    try {
      // O texto pendente na caixa vira a justificativa da transição — evita o
      // usuário escrever, clicar em resolver e perder o que digitou.
      await alterarStatusAlerta(alerta!.id, status, texto.trim() || null)
      setTexto('')
      await recarregarHistorico()
      onMudou()
    } catch (e) {
      toast.error(mensagemErro(e, 'Erro ao alterar status.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="sticky top-0 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
      {/* CABEÇALHO */}
      <div className="border-b border-slate-100 p-5">
        <div className="mb-2 flex items-center gap-2">
          <OrigemTag
            origem={alerta.origem}
            detalhe={alerta.origem === 'sistema' ? alerta.regra_nome : alerta.criado_por_nome}
          />
          <StatusBadge status={alerta.status} />
        </div>
        <h2 className="text-lg font-semibold leading-tight text-slate-900">
          {ref.paciente_nome || alerta.titulo}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {[ref.hora, ref.terapia].filter(Boolean).join(' · ') || alerta.titulo}
        </p>
      </div>

      {/* ATENDIMENTO */}
      <div className="space-y-6 p-5">
        <section>
          <SectionTitle>Atendimento</SectionTitle>
          <dl className="space-y-2.5">
            <Row label="Paciente" value={ref.paciente_nome} />
            <Row label="Data" value={formatarData(ref.data)} />
            <Row label="Hora" value={ref.hora} />
            <Row label="Terapia" value={ref.terapia} />
            <Row label="Profissional" value={ref.profissional} />
            <Row label="TUSS" value={ref.tuss} mono />
          </dl>
        </section>

        <section>
          <SectionTitle>Pendência</SectionTitle>
          <dl className="space-y-2.5">
            <Row label="Motivo" value={alerta.descricao || alerta.titulo} />
            <Row label="Setor" value={alerta.setor_destino} />
            <Row
              label="Aberta em"
              value={new Date(alerta.criado_em).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            />
            {alerta.origem === 'manual' && (
              <Row label="Criada por" value={alerta.criado_por_nome} />
            )}
            {resolvido && (
              <Row
                label="Encerrada"
                value={
                  alerta.resolucao === 'automatico'
                    ? 'Automaticamente pelo sistema'
                    : 'Manualmente'
                }
              />
            )}
          </dl>
        </section>

        {/* LINHA DO TEMPO — reusa components/central/Timeline.tsx sem alteração:
            get_alerta_historico já devolve { id, status, descricao, created_at, erro }. */}
        <section>
          <SectionTitle>Linha do tempo</SectionTitle>
          {carregandoEventos ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <Timeline logs={eventos} />
          )}
        </section>

        {/* AÇÕES */}
        <section>
          <SectionTitle>Registrar</SectionTitle>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 1000))}
            placeholder="Escreva uma observação (ex.: portal da ASSIM indisponível, solicitação realizada às 10:15)…"
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
          />
          <div className="mt-1.5 flex justify-end text-xs text-slate-400">
            {texto.length} / 1000
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enviarComentario}
              disabled={enviando || !texto.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Comentar
            </button>

            {alerta.status === 'aberto' && (
              <button
                type="button"
                onClick={() => mudarStatus('em_andamento')}
                disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:opacity-40"
              >
                <PlayCircle size={14} />
                Assumir
              </button>
            )}

            {!resolvido && (
              <button
                type="button"
                onClick={() => mudarStatus('resolvido')}
                disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                <CheckCircle2 size={14} />
                Marcar como resolvida
              </button>
            )}

            {/* Reabrir é ação de gestão — a RPC também bloqueia, este gate é só UX. */}
            {resolvido && gestao && (
              <button
                type="button"
                onClick={() => mudarStatus('aberto')}
                disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Reabrir
              </button>
            )}
          </div>

          {resolvido && alerta.resolucao === 'automatico' && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
              Encerrada automaticamente: o atendimento recebeu desfecho operacional.
              Comentários continuam permitidos para registro.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    aberto:       'bg-red-50 text-red-600 ring-red-300',
    em_andamento: 'bg-blue-50 text-blue-600 ring-blue-300',
    resolvido:    'bg-emerald-50 text-emerald-700 ring-emerald-300',
  }
  const label: Record<string, string> = {
    aberto: 'Aberta',
    em_andamento: 'Em andamento',
    resolvido: 'Resolvida',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cfg[status] ?? cfg.aberto}`}>
      {label[status] ?? status}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
      {children}
    </h3>
  )
}

function Row({
  label, value, mono,
}: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className={`wrap-break-word text-right text-sm text-slate-700 ${mono ? 'tabular-nums' : ''}`}>
        {value || <span className="text-slate-300">—</span>}
      </dd>
    </div>
  )
}

function formatarData(data?: string | null) {
  if (!data) return null
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return data
  return `${dia}/${mes}/${ano}`
}

/** Erros das RPCs vêm com mensagem em português — preserva quando existir. */
function mensagemErro(e: unknown, fallback: string) {
  const msg = (e as { message?: string })?.message
  return msg && !msg.includes('JSON') ? msg : fallback
}
