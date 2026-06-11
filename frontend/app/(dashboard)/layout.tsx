'use client'

import Sidebar from "@/components/Sidebar"
import { ImpersonationBar } from '@/components/admin/ImpersonationBar'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

import {
  HeaderProvider,
  useHeader,
} from '@/contexts/HeaderContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ImpersonationProvider } from '@/contexts/ImpersonationContext'

const supabase = getSupabaseClient()

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('role')
        .eq('id', data.session.user.id)
        .single()
      if (perfil?.role === 'disponibilidade_terapeuta') {
        router.replace('/disponibilidade-terapeuta/')
        return
      }
      setChecking(false)
    })
  }, [])

  if (checking) return null

  return (
    <ImpersonationProvider>
      <ThemeProvider>
        <HeaderProvider>
          <DashboardShell>
            {children}
          </DashboardShell>
        </HeaderProvider>
      </ThemeProvider>
    </ImpersonationProvider>
  )
}

function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const { title, subtitle } = useHeader()

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <ImpersonationBar />
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen">

        {/* HEADER — só exibe quando há título */}
        {title && (
          <header className="h-20 bg-card border-b border-border flex items-center px-6 shrink-0">
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </header>
        )}

        {/* PAGE */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>

      </div>
    </div>
  )
}