'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function CentralAtendimentoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router  = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }
      setReady(true)
    })
  }, [router])

  if (!ready) return null

  return (
    <div className="h-dvh w-full overflow-hidden bg-background text-foreground">
      {children}
    </div>
  )
}
