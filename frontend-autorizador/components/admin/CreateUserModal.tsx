'use client'

import { useState } from 'react'
import { getFunctionHeaders, getFunctionUrl } from '@/lib/supabase/functions'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default function CreateUserModal() {
  const [open, setOpen] = useState(false)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('recepcao')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleCreateUser() {
    try {
      setLoading(true)
      setMessage('')

      const response = await fetch(getFunctionUrl('admin-create-user'), {
        method: 'POST',
        headers: await getFunctionHeaders(),
        body: JSON.stringify({
          nome,
          email,
          role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setMessage('Convite enviado com sucesso!')

      setNome('')
      setEmail('')
      setRole('recepcao')

      setTimeout(() => {
        setOpen(false)
      }, 1200)
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="rounded-xl bg-[#3A8FB7] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
          + Novo usuário
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px] rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              Adicionar usuário
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              placeholder="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <select
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="recepcao">Recepção</option>
              <option value="terapeutico">Terapêutico</option>
              <option value="faturamento">Faturamento</option>
              <option value="diretoria">Diretoria</option>
              <option value="admin">Admin</option>
            </select>

            <button
              onClick={handleCreateUser}
              disabled={loading}
              className="w-full rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar convite'}
            </button>

            {message && (
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                {message}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}