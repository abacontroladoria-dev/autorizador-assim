'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import GeneratedPasswordReveal from './GeneratedPasswordReveal'

export default function ResetPasswordModal({
  result,
  onClose,
}: {
  result: { nome: string; email: string; username: string; password: string } | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={!!result}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-100 rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              Senha redefinida
            </DialogTitle>
          </DialogHeader>

          {result && (
            <GeneratedPasswordReveal
              nome={result.nome}
              email={result.email}
              username={result.username}
              password={result.password}
              onClose={onClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
