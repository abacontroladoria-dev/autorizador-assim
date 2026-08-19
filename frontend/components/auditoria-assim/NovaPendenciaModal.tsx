'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Search, X } from 'lucide-react'
import { toast } from 'react-hot-toast'

import { criarAlerta } from '@/services/alertas.service'
import { listarAuditoriaAssim } from '@/services/auditoria-assim.service'
import type { AuditoriaAssimItem } from '@/components/auditoria-assim/types'
import type { AlertaPrioridade } from '@/components/alertas/types'

type Props = {
  open: boolean
  onClose: () => void
  onCriado: () => void
}

const PRIORIDADES: { key: AlertaPrioridade; label: string }[] = [
  { key: 'media',   label: 'Média' },
  { key: 'alta',    label: 'Alta' },
  { key: 'critica', label: 'Crítica' },
]

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Criação de pendência MANUAL — o caso "vi algo estranho, recepção confere", que
 * hoje a Luana faz abrindo tarefa no ClickUp.
 *
 * A lista de atendimentos vem de listarAuditoriaAssim (a mesma RPC da aba
 * Auditoria), então não há fonte de verdade nova: ela escolhe um atendimento real
 * do dia e o bloco_id dele vira a entidade do alerta — exatamente a mesma chave
 * que a geração automática usa, o que faz o encerramento automático valer também
 * para pendência manual.
 *
 * Quem pode criar é decidido em fn_alerta_criar (admin/diretoria/autorizacao); o
 * botão que abre este modal é escondido para os demais apenas por UX.
 */
export default function NovaPendenciaModal({ open, onClose, onCriado }: Props) {
  const [data, setData] = useState(hojeLocal())
  const [itens, setItens] = useState<AuditoriaAssimItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<AuditoriaAssimItem | null>(null)
  const [motivo, setMotivo] = useState('')
  const [prioridade, setPrioridade] = useState<AlertaPrioridade>('alta')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open) return
    let ativo = true
    setCarregando(true)
    listarAuditoriaAssim(data).then((lista) => {
      if (!ativo) return
      setItens(lista)
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [open, data])

  // Limpa a seleção ao trocar de dia — o bloco_id selecionado não existe no novo.
  useEffect(() => { setSelecionado(null) }, [data])

  useEffect(() => {
    if (!open) {
      setBusca(''); setSelecionado(null); setMotivo(''); setPrioridade('alta')
    }
  }, [open])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const base = termo
      ? itens.filter((i) => i.paciente_nome?.toLowerCase().includes(termo))
      : itens
    return base.slice(0, 60)
  }, [itens, busca])

  if (!open) return null

  async function salvar() {
    if (!selecionado?.bloco_id || !motivo.trim()) return
    setSalvando(true)
    try {
      await criarAlerta({
        modulo: 'assim',
        entidadeTipo: 'atendimento',
        entidadeId: selecionado.bloco_id,
        entidadeRef: {
          paciente_nome: selecionado.paciente_nome,
          data,
          hora: selecionado.hora_inicial?.slice(0, 5) ?? null,
          terapia: selecionado.terapias,
          profissional: selecionado.profissionais,
          tuss: selecionado.codigo_tuss,
        },
        titulo: motivo.trim().slice(0, 120),
        descricao: motivo.trim(),
        setorDestino: 'recepcao',
        prioridade,
      })
      toast.success('Pendência criada para a Recepção.')
      onCriado()
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message
      toast.error(msg || 'Erro ao criar pendência.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pb-4 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nova pendência</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Para o que o sistema não detecta sozinho. Vai direto para a Recepção.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-t border-slate-100" />

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Atendimento */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Atendimento</h3>
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[170px_1fr]">
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <label className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar paciente"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              {carregando && (
                <div className="space-y-1.5 p-2">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-9 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              )}

              {!carregando && filtrados.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-slate-400">
                  Nenhum atendimento ASSIM nesta data.
                </p>
              )}

              {!carregando && filtrados.map((item) => {
                const ativo = selecionado?.bloco_id === item.bloco_id
                return (
                  <button
                    key={item.bloco_id}
                    type="button"
                    onClick={() => setSelecionado(item)}
                    className={`flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left text-sm transition last:border-0 ${
                      ativo ? 'bg-brand-surface text-brand-fg' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-11 shrink-0 tabular-nums text-xs text-slate-500">
                      {item.hora_inicial?.slice(0, 5) ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {item.paciente_nome ?? '—'}
                    </span>
                    <span className="hidden max-w-[38%] truncate text-xs text-slate-400 sm:block">
                      {item.terapias ?? ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Motivo</h3>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 1000))}
              placeholder="Ex.: Atendimento sem autorização localizada. Favor verificar se a solicitação foi esquecida."
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex gap-1.5">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPrioridade(p.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      prioridade === p.key
                        ? 'bg-brand-fg text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">{motivo.length} / 1000</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={salvando}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !selecionado || !motivo.trim()}
            className="flex items-center gap-2 rounded-xl bg-brand-fg px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {salvando ? 'Criando…' : 'Criar pendência'}
          </button>
        </div>
      </div>
    </div>
  )
}
