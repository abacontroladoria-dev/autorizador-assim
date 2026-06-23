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
 * Fluxo:
 *   Pulsar user (authenticated)
 *     ↓
 *   PulsarAuthProvider wraps ConnectApp
 *     ↓
 *   useAuth() returns Pulsar user (converted to Nina shape)
 *     ↓
 *   Components render without redirect or extra auth
 */

import { createContext, useContext, ReactNode, useMemo } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { useAuth as usePulsarAuth } from '@/hooks/nina/useAuth'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: SupabaseUser | null
  session: null // Not used in Connect
  loading: boolean
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Convert Pulsar User to Supabase User shape
 * Pulsar's User object should be compatible, but we ensure
 * all expected fields exist
 */
function convertPulsarUserToNinaUser(pulsarUser: SupabaseUser | null): SupabaseUser | null {
  if (!pulsarUser) return null

  // Return as-is; Pulsar user is already a valid Supabase User
  // (it comes from Supabase, just a different instance)
  return pulsarUser
}

export const PulsarAuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: pulsarUser, loading: pulsarLoading } = usePulsarAuth()
  const router = useRouter()

  // Convert Pulsar user to Nina-compatible shape
  const user = useMemo(() => convertPulsarUserToNinaUser(pulsarUser), [pulsarUser])

  // No session for Connect (Pulsar handles it server-side)
  const session = null

  // Not loading after initial Pulsar auth
  const loading = pulsarLoading

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
      // Get Pulsar auth client and sign out
      const { createClient } = await import('@supabase/supabase-js')
      const pulsarClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      await pulsarClient.auth.signOut()

      // Redirect to Pulsar login
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
