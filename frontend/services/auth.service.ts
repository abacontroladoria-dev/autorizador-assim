import { getSupabaseClient } from '@/lib/supabase/client'

export async function login(email: string, password: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  return { data, error }
}

export async function logout() {
  const supabase = getSupabaseClient()
  await supabase.auth.signOut()
}

export async function getUser() {
  const supabase = getSupabaseClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}