'use client'

import { createContext, useContext, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({
  user,
  session,
  children,
}: {
  user: User | null
  session: Session | null
  children: ReactNode
}) => {
  const signUp = async (email: string, password: string, fullName?: string) => {
    // Sign up is disabled for Nina — use Pulsar auth
    return { error: new Error('Use o login do Pulsar') as Error | null }
  }

  const signIn = async (email: string, password: string) => {
    // Sign in is disabled for Nina — use Pulsar auth
    return { error: new Error('Use o login do Pulsar') as Error | null }
  }

  const signOut = async () => {
    await getSupabaseClient().auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading: false,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
