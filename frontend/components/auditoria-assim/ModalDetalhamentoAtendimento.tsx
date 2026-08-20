'use client'

import { useCallback, useEffect, useState } from 'react'
import { useModalDialog } from '@/hooks/useModalDialog'
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
import SituacaoBadge, { SITUACAO_CONFIG, SITUACAO_FALLBACK } from './SituacaoBadge'

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

/**
 * Estados que uma célula de fato pode carregar.
 *
 * Só a conferência de filipeta usa isto, e de propósito: é o par emerald/amber
 * que a TabelaAuditoria já pinta no botão de conferir, então a mesma dimensão
 * tem a mesma aparência na lista e no detalhe. Âmbar aqui significa o que
 * significa em toda a tela — esperando alguém. Rótulo e valor continuam em
 * texto; a cor confirma, não informa sozinha.
 */
const FACT_STATE = {
  neutro: { box: 'border-slate-200/80 bg-slate-50/70', dt: 'text-slate-600', dd: 'text-slate-800' },
  ok: { box: 'border-emerald-200 bg-emerald-50/70', dt: 'text-emerald-700', dd: 'text-emerald-800' },
  espera: { box: 'border-amber-200 bg-amber-50/70', dt: 'text-amber-700', dd: 'text-amber-800' },
} as const

/** Ficha compacta: uma célula de fato (rótulo + valor), não uma linha de lista. */
function Fact({
  icon: Icon,
  label,
  value,
  mono,
  full,
  state = 'neutro',
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: React.ReactNode
  mono?: boolean
  full?: boolean
  state?: keyof typeof FACT_STATE
}) {
  const tom = FACT_STATE[state]
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tom.box} ${full ? 'col-span-2' : ''}`}>
      <dt className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${tom.dt}`}>
        <Icon size={11} className="shrink-0" />
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-medium leading-snug wrap-break-word ${mono ? 'font-mono tabular-nums text-[13px]' : ''} ${tom.dd}`}
      >
        {value ?? <span className="font-normal text-slate-500">—</span>}
      </dd>
    </div>
  )
}

/**
 * Rótulo estrutural das seções — a única aparição do steel da marca na ficha.
 *
 * Steel aqui e em mais nenhum lugar: é o que dá identidade à superfície sem
 * disputar com os matizes de situação, que são os que carregam significado. Se
 * ele descesse para os 16 rótulos de campo deixaria de ser sinal e viraria a
 * cor do texto do modal.
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-fg">
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

  // Mesmo hook do ModalTokenMensal: semântica de diálogo, Escape, foco preso e
  // devolvido ao gatilho, e trava de rolagem do fundo. Passou a importar mais
  // aqui depois que o "Fechar" do rodapé saiu — sem Escape, quem usa teclado
  // dependia de tabular até o X.
  const fechar = useCallback(() => onClose(), [onClose])
  const { refDialogo, propsDialogo } = useModalDialog(
    open && Boolean(item),
    fechar,
    'titulo-detalhamento-atendimento'
  )

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
  // O cabeçalho inteiro veste o matiz da situação, no lugar da lombada de 4px
  // que existia antes: a faixa era cor sem contato com conteúdo nenhum, e a
  // severidade só se lia mesmo no badge. Tingindo a superfície, o estado chega
  // junto com o nome do paciente. Continua sendo tinta -50 sob texto slate — a
  // cor reforça o badge, nunca substitui o rótulo.
  const superficieSituacao =
    (item.situacao && SITUACAO_CONFIG[item.situacao]?.surface) || SITUACAO_FALLBACK.surface
  const temErro = Boolean(item.codigo_erro || item.descricao_erro)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — a superfície é o sinal de severidade */}
        <div className={`flex items-start justify-between border-b px-6 pt-4 pb-3 ${superficieSituacao}`}>
          <div className="min-w-0">
            <h2
              id="titulo-detalhamento-atendimento"
              className="truncate text-lg font-semibold text-slate-900"
            >
              {item.paciente_nome ?? 'Detalhamento do atendimento'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-600">{item.terapias ?? 'Sem terapia'}</p>
            <div className="mt-2">
              <SituacaoBadge situacao={item.situacao} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content — duas colunas lado a lado: leitura à esquerda, ação à
            direita. Cada painel rola de forma independente só como rede de
            segurança para conteúdo excepcionalmente longo; no caso comum as
            duas colunas cabem inteiras em 90dvh e o corpo do modal não rola. */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:divide-x md:divide-slate-200">

          {/* Coluna esquerda — dados do atendimento, somente leitura */}
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4 md:w-1/2 md:shrink-0">

            {/* Sessão */}
            <section>
              <SectionTitle>Sessão</SectionTitle>
              <dl className="grid grid-cols-2 gap-1.5">
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
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <dl className="grid grid-cols-2 gap-1.5 p-1.5">
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
                      state={item.token_conferido ? 'ok' : 'espera'}
                    />
                  )}
                </dl>

                {(item.status_assim || temErro || item.observacao) && (
                  <div
                    className={`flex items-start gap-2 border-t px-3 py-2 text-xs ${
                      temErro
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {temErro ? (
                      <AlertOctagon size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-500" />
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

          </div>

          {/* Coluna direita — o que fazer a respeito do atendimento */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">

            {/* Motivo da glosa — só para linhas GLOSA */}
            {item.situacao === 'GLOSA' && (
              <section className="shrink-0 rounded-xl border border-violet-200 bg-violet-50/40 p-3.5">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-violet-900">
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
                      rows={2}
                      className="w-full resize-none rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700 transition placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <div className="mt-1 mb-1.5 flex justify-between">
                      <span className="text-xs text-violet-700">Campo obrigatório.</span>
                      <span className="text-xs tabular-nums text-slate-500">{motivo.length} / 1000</span>
                    </div>
                    {/* Steel, não violeta: violeta é o matiz de GLOSA e ação
                        primária usa a marca. Fosse violeta, o mesmo tom estaria
                        dizendo "este bloco é glosa" e "clique aqui" na mesma
                        seção — e os dois botões de salvar do modal não seriam o
                        mesmo botão. */}
                    <button
                      onClick={handleSalvarMotivo}
                      disabled={salvandoMotivo || !motivo.trim()}
                      className="flex items-center gap-2 rounded-xl bg-brand-fg px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {salvandoMotivo ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {salvandoMotivo ? 'Salvando...' : 'Salvar motivo'}
                    </button>
                  </>
                )}
              </section>
            )}

            {/* Observações — livre, qualquer status, sempre editável. Cresce
                para preencher o restante da coluna, então o textarea usa o
                espaço vertical que sobra em vez de ficar minúsculo. */}
            <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 p-3.5">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <MessageSquare size={14} className="text-brand" />
                Observações
              </h3>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value.slice(0, 1000))}
                placeholder="Registre um lembrete ou combinado sobre este atendimento."
                className="w-full min-h-20 flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-700 transition placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="mt-1 mb-1.5 flex justify-between gap-4">
                <span className="truncate text-xs text-slate-500">
                  {item.observacao_manual_atualizado_por_nome && atualizadoObservacao
                    ? `Atualizado por ${item.observacao_manual_atualizado_por_nome} em ${atualizadoObservacao}`
                    : ''}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{observacao.length} / 1000</span>
              </div>
              <button
                onClick={handleSalvarObservacao}
                disabled={salvandoObservacao || observacao.trim() === (item.observacao_manual ?? '')}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-brand-fg px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoObservacao ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {salvandoObservacao ? 'Salvando...' : 'Salvar observação'}
              </button>
            </section>

          </div>

        </div>

      </div>
    </div>
  )
}
