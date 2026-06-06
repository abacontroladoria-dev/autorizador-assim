'use client'

import { useRouter } from 'next/navigation'

export default function SemPermissaoPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 px-4 py-12">
      <div className="mx-auto max-w-3xl rounded-4xl border border-slate-200 bg-white p-10 shadow-xl">
        <div className="text-center">
          <span className="inline-flex rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700">
            Acesso negado
          </span>
          <h1 className="mt-6 text-3xl font-semibold text-slate-900">Você não tem permissão</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Sua conta não tem acesso administrativo para esta área. Entre em contato com a equipe responsável se precisar de autorização.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => router.push('/')}
            className="rounded-2xl bg-[#3A8FB7] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#357fa1]"
          >
            Voltar para o painel
          </button>

          <button
            onClick={() => router.push('/login')}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Ir para login
          </button>
        </div>
      </div>
    </div>
  )
}
