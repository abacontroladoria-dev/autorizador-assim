'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getSupabaseClient } from '@/lib/supabase/client'

interface Props {
  open: boolean
  onClose: () => void
  email: string
}

function passwordStrength(p: string): { label: string; color: string; width: string } {
  if (p.length === 0) return { label: '', color: '', width: 'w-0' }
  const hasNum = /\d/.test(p)
  const hasUpper = /[A-Z]/.test(p)
  const hasSpecial = /[^a-zA-Z0-9]/.test(p)
  const score = [p.length >= 8, hasNum, hasUpper, hasSpecial].filter(Boolean).length
  if (score <= 1) return { label: 'Fraca', color: 'bg-red-400', width: 'w-1/4' }
  if (score === 2) return { label: 'Média', color: 'bg-yellow-400', width: 'w-2/4' }
  if (score === 3) return { label: 'Boa', color: 'bg-blue-400', width: 'w-3/4' }
  return { label: 'Forte', color: 'bg-green-400', width: 'w-full' }
}

function PasswordInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function ModalAlterarSenha({ open, onClose, email }: Props) {
  const supabase = getSupabaseClient()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)

  const strength = passwordStrength(novaSenha)

  function reset() {
    setSenhaAtual('')
    setNovaSenha('')
    setConfirmar('')
  }

  async function handleSubmit() {
    if (!senhaAtual || !novaSenha || !confirmar) {
      toast.error('Preencha todos os campos')
      return
    }
    if (novaSenha.length < 8) {
      toast.error('A nova senha deve ter pelo menos 8 caracteres')
      return
    }
    if (!/\d/.test(novaSenha)) {
      toast.error('A nova senha deve conter ao menos um número')
      return
    }
    if (novaSenha !== confirmar) {
      toast.error('As senhas não coincidem')
      return
    }

    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: senhaAtual,
    })

    if (signInError) {
      toast.error('Senha atual incorreta')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: novaSenha,
    })

    if (updateError) {
      toast.error('Erro ao atualizar senha: ' + updateError.message)
      setLoading(false)
      return
    }

    toast.success('Senha alterada com sucesso')
    reset()
    onClose()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              Alterar senha
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            <PasswordInput
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={setSenhaAtual}
            />

            <div>
              <PasswordInput
                placeholder="Nova senha"
                value={novaSenha}
                onChange={setNovaSenha}
              />
              {novaSenha.length > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-slate-200">
                    <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{strength.label}</p>
                </div>
              )}
            </div>

            <PasswordInput
              placeholder="Confirmar nova senha"
              value={confirmar}
              onChange={setConfirmar}
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
