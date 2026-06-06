'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
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
  const [comSenha, setComSenha] = useState(false)
  const [senha, setSenha] = useState('')
  const [username, setUsername] = useState('')
  const [showSenha, setShowSenha] = useState(false)

  function resetForm() {
    setNome('')
    setEmail('')
    setRole('recepcao')
    setSenha('')
    setUsername('')
    setComSenha(false)
    setShowSenha(false)
  }

  async function handleCreateUser() {
    if (!nome.trim() || !email.trim()) {
      toast.error('Preencha nome e email.')
      return
    }

    if (comSenha && !senha.trim()) {
      toast.error('Preencha a senha.')
      return
    }

    try {
      setLoading(true)

      if (comSenha) {
        const res = await fetch('/api/admin/create-user-with-password', {
          method: 'POST',
          headers: await getFunctionHeaders(),
          body: JSON.stringify({ nome, email, role, password: senha, username: username || null }),
        })

        const json = await res.json()

        if (!res.ok) throw new Error(json.error ?? 'Erro ao criar usuário')

        toast.success(`Usuário ${nome} criado com sucesso`)
      } else {
        const res = await fetch(getFunctionUrl('admin-create-user'), {
          method: 'POST',
          headers: await getFunctionHeaders(),
          body: JSON.stringify({ nome, email, role }),
        })

        const json = await res.json()

        if (!res.ok) throw new Error(json.error ?? 'Erro ao enviar convite')

        toast.success(`Convite enviado para ${email}`)
      }

      resetForm()
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <button className="rounded-xl bg-[#3A8FB7] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
          + Novo usuário
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-120 rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              Adicionar usuário
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 space-y-4">

            {/* Toggle convite / senha */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-medium">
              <button
                type="button"
                onClick={() => setComSenha(false)}
                className={`flex-1 py-2.5 transition ${!comSenha ? 'bg-[#3A8FB7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                Enviar convite
              </button>
              <button
                type="button"
                onClick={() => setComSenha(true)}
                className={`flex-1 py-2.5 transition ${comSenha ? 'bg-[#3A8FB7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                Criar com senha
              </button>
            </div>

            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

            <input
              type="email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {comSenha && (
              <>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
                  placeholder="Usuário (opcional)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
                <div className="relative">
                  <input
                    type={showSenha ? 'text' : 'password'}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
                    placeholder="Senha"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </>
            )}

            <select
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="recepcao">Recepção</option>
              <option value="terapeutico">Terapêutico</option>
              <option value="faturamento">Faturamento</option>
              <option value="autorizacao">Autorização</option>
              <option value="rp">RP</option>
              <option value="diretoria">Diretoria</option>
              <option value="admin">Admin</option>
              <option value="disponibilidade_terapeuta">Disponib. Terapeuta</option>
            </select>

            <button
              onClick={handleCreateUser}
              disabled={loading}
              className="w-full rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading
                ? 'Criando...'
                : comSenha
                ? 'Criar usuário'
                : 'Enviar convite'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
