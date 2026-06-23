'use client'

/**
 * PulsarAuthProvider — Adapter que fornece o usuário Pulsar autenticado
 * ao ecosistema Nina sem depender de Supabase Nina.
 *
 * Propósito:
 *   ConnectApp espera um AuthProvider que forneça useAuth()
 *   ao invés de fazer login no Supabase Nina, fornecemos
 *   o usuário já autenticado do Pulsar.
 *
 * Arquitetura:
 *   - Cria um cliente Supabase Pulsar (não Nina)
 *   - Monitora a sessão de autenticação do Pulsar via onAuthStateChange
 *   - Fornece o usuário Pulsar através de AuthContext (compatível com Nina)
 *   - Sem dependência em hooks ou providers da Nina
 *
 * Fluxo:
 *   Pulsar user (authenticated)
 *     ↓
 *   PulsarAuthProvider cria cliente Supabase Pulsar
 *     ↓
 *   Monitora onAuthStateChange
 *     ↓
 *   useAuth() returns Pulsar user via context
 *     ↓
 *   Components render sem redirect ou auth extra
 */

import { createContext, useContext, ReactNode, useState, useEffect } from 'react'
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: SupabaseUser | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Cliente Supabase Pulsar (não Nina)
const pulsarSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const PulsarAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Monitor Pulsar auth state
  useEffect(() => {
    const { data: { subscription } } = pulsarSupabase.auth.onAuthStateChange(
      (event, sess) => {
        console.log('[PulsarAuthProvider] Auth state changed:', { event, hasUser: !!sess?.user })
        setSession(sess)
        setUser(sess?.user ?? null)
        setLoading(false)
      }
    )

    // Get current session
    pulsarSupabase.auth.getSession().then(({ data: { session: sess } }) => {
      console.log('[PulsarAuthProvider] Got session:', { hasSession: !!sess })
      setSession(sess)
      setUser(sess?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Sign up: Not available in Connect (use Pulsar signup)
  const signUp = async (email: string, password: string, fullName?: string) => {
    return {
      error: new Error('Sign up not available in Connect. Use Pulsar signup.'),
    }
  }

  // Sign in: Not available in Connect (use Pulsar login)
  const signIn = async (email: string, password: string) => {
    return {
      error: new Error('Sign in not available in Connect. Use Pulsar login.'),
    }
  }

  // Sign out: Logout from Pulsar
  const signOut = async () => {
    try {
      console.log('[PulsarAuthProvider] Signing out...')
      await pulsarSupabase.auth.signOut()
      setUser(null)
      setSession(null)
      router.push('/auth')
    } catch (err) {
      console.error('[PulsarAuthProvider] signOut error:', err)
      throw err
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within a PulsarAuthProvider')
  }
  return context
}
