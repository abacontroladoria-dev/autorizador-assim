'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { CalculadoraProvider } from '@/components/remuneracao/CalculadoraProvider'

const ALLOWED_ROLES = ['admin', 'diretoria', 'rp', 'faturamento']

export default function RemuneracaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseClient()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      const { data: perfil } = await supabase
        .from('usuarios').select('role').eq('id', data.session.user.id).single()
      if (!ALLOWED_ROLES.includes(perfil?.role ?? '')) {
        router.replace('/sem-permissao'); return
      }
      setAllowed(true)
    })
  }, [])

  if (!allowed) return null

  return <CalculadoraProvider>{children}</CalculadoraProvider>
}
