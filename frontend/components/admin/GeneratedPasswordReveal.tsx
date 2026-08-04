'use client'

import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

export default function GeneratedPasswordReveal({
  nome,
  password,
  description,
  onClose,
  closeLabel = 'Fechar',
}: {
  nome: string
  password: string
  description?: ReactNode
  onClose: () => void
  closeLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      toast.success('Senha copiada')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar a senha')
    }
  }

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">
        {description ?? (
          <>
            Envie a senha temporária abaixo para <strong>{nome}</strong>. No
            próximo login, será solicitado que ele crie uma nova senha.
          </>
        )}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <code className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono tracking-wide text-slate-800">
          {password}
        </code>
        <button
          onClick={handleCopy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          title="Copiar senha"
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </button>
      </div>

      <p className="mt-3 text-xs text-amber-600">
        Esta senha não será exibida novamente. Copie-a agora.
      </p>

      <button
        onClick={onClose}
        className="mt-6 w-full rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        {closeLabel}
      </button>
    </div>
  )
}
