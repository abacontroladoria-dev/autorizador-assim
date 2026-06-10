'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const supabase = getSupabaseClient()
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const rawNext = searchParams.get('next') ?? '/definir-senha'
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/definir-senha'

    async function handle() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) { router.replace(next); return }
      }

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as any,
        })
        if (!error) { router.replace(next); return }
      }

      router.replace('/definir-senha?error=link_expirado')
    }

    handle()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500 text-sm">Verificando acesso...</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
