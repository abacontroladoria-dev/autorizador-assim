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

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  diretoria: 'Diretoria',
  recepcao: 'Recepção',
  autorizacao: 'Autorização',
  terapeutico: 'Terapêutico',
  faturamento: 'Faturamento',
}

interface Props {
  open: boolean
  onClose: () => void
  userId: string
}

export default function ModalPerfil({ open, onClose, userId }: Props) {
  const supabase = getSupabaseClient()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !userId) return
    async function loadPerfil() {
      setLoading(true)
      const { data, error } = await supabase
        .from('usuarios')
        .select('nome, email, role, username')
        .eq('id', userId)
        .single()
      if (error) {
        toast.error('Erro ao carregar perfil')
      } else if (data) {
        setNome(data.nome ?? '')
        setEmail(data.email ?? '')
        setRole(data.role ?? '')
        setUsername(data.username ?? '')
      }
      setLoading(false)
    }
    loadPerfil()
  }, [open, userId])

  async function handleSave() {
    if (!nome.trim()) {
      toast.error('Nome não pode ser vazio')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('usuarios')
      .update({ nome: nome.trim() })
      .eq('id', userId)
    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
    } else {
      toast.success('Perfil atualizado')
      onClose()
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              Meu perfil
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="mt-6 py-8 text-center text-sm text-slate-400">
              Carregando...
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nome</label>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">E-mail</label>
                <input
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                  value={email}
                />
              </div>

              {username && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Usuário</label>
                  <input
                    disabled
                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                    value={username}
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Perfil de acesso</label>
                <input
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                  value={roleLabels[role] ?? role}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
