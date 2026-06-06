'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getSupabaseClient } from '@/lib/supabase/client'

interface ErroItem {
  id: string
  paciente_nome: string | null
  created_at: string
  error_message: string | null
  status: string
}

interface Props {
  open: boolean
  onClose: () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ModalErros({ open, onClose }: Props) {
  const supabase = getSupabaseClient()
  const [erros, setErros] = useState<ErroItem[]>([])
  const [loading, setLoading] = useState(false)
  const [reprocessandoId, setReprocessandoId] = useState<string | null>(null)
  const [reprocessandoTodos, setReprocessandoTodos] = useState(false)

  async function fetchErros() {
    setLoading(true)
    const { data, error } = await supabase
      .from('fila_autorizacoes')
      .select('id, paciente_nome, created_at, error_message, status')
      .eq('status', 'erro')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) toast.error('Erro ao carregar processos')
    else setErros(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (open) fetchErros()
  }, [open])

  async function reprocessar(id: string) {
    setReprocessandoId(id)
    const { error } = await supabase
      .from('fila_autorizacoes')
      .update({ status: 'pendente', error_message: null })
      .eq('id', id)
    if (error) {
      toast.error('Erro ao reprocessar')
    } else {
      toast.success('Processo enviado para reprocessamento')
      setErros((prev) => prev.filter((e) => e.id !== id))
    }
    setReprocessandoId(null)
  }

  async function reprocessarTodos() {
    if (erros.length === 0) return
    setReprocessandoTodos(true)
    const ids = erros.map((e) => e.id)
    const { error } = await supabase
      .from('fila_autorizacoes')
      .update({ status: 'pendente', error_message: null })
      .in('id', ids)
    if (error) {
      toast.error('Erro ao reprocessar')
    } else {
      toast.success(`${ids.length} processo${ids.length !== 1 ? 's' : ''} enviado${ids.length !== 1 ? 's' : ''} para reprocessamento`)
      setErros([])
    }
    setReprocessandoTodos(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white">
          <div className="p-6 pb-0">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-semibold text-slate-900">
                  Processos com erro
                </DialogTitle>
                {erros.length > 0 && (
                  <button
                    onClick={reprocessarTodos}
                    disabled={reprocessandoTodos}
                    className="text-xs font-medium text-[#3A8FB7] hover:underline disabled:opacity-50"
                  >
                    {reprocessandoTodos ? 'Reprocessando...' : 'Reprocessar todos'}
                  </button>
                )}
              </div>
            </DialogHeader>
          </div>

          <div className="mt-4 max-h-96 overflow-y-auto px-6 pb-6">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-400">Carregando...</p>
            ) : erros.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nenhum processo com erro.</p>
            ) : (
              <div className="space-y-3">
                {erros.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.paciente_nome ?? 'Paciente desconhecido'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(item.created_at)}
                      </p>
                      {item.error_message && (
                        <p className="mt-1 line-clamp-2 text-xs text-red-400">
                          {item.error_message}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => reprocessar(item.id)}
                      disabled={reprocessandoId === item.id}
                      className="shrink-0 rounded-xl bg-[#3A8FB7] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {reprocessandoId === item.id ? '...' : 'Reprocessar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
