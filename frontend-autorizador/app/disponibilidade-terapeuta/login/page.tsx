'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

export default function LoginDisponibilidadePage() {
  const router = useRouter()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!mounted) return

      if (session) {
        const { data: perfil } = await supabase
          .from('usuarios')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (perfil?.role === 'disponibilidade_terapeuta') {
          router.replace('/disponibilidade-terapeuta/')
          return
        }

        await supabase.auth.signOut()
      }

      setChecking(false)
    }

    checkSession()
    return () => { mounted = false }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    let emailToUse = login

    if (!login.includes('@')) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auth-lookup-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: login.toLowerCase() }),
        }
      )

      if (!res.ok) {
        setErro('Usuário não encontrado')
        setLoading(false)
        return
      }

      const { email } = await res.json()
      emailToUse = email
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: senha,
    })

    if (error || !data.user) {
      setErro('Login ou senha inválidos')
      setLoading(false)
      return
    }

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('role, ativo')
      .eq('id', data.user.id)
      .single()

    if (!perfil?.ativo) {
      await supabase.auth.signOut()
      setErro('Usuário desativado')
      setLoading(false)
      return
    }

    if (perfil?.role !== 'disponibilidade_terapeuta') {
      await supabase.auth.signOut()
      setErro('Acesso não autorizado')
      setLoading(false)
      return
    }

    router.replace('/disponibilidade-terapeuta/')
  }

  if (checking) return null

  return (
    <main className="min-h-screen bg-[#f4f7fb] flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center">
            <img
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">Clínica Universo ABA</h1>
            <p className="text-sm font-semibold text-[#3A8FB7]">Registro de Disponibilidade</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Entrar</h2>
          <p className="text-sm text-slate-500 mb-6">Acesso exclusivo para registro de disponibilidade</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {erro && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-xl">
                {erro}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Login</label>
              <input
                type="text"
                placeholder="E-mail ou usuário"
                value={login}
                onChange={(e) => setLogin(e.target.value.toLowerCase())}
                className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/30 focus:border-[#3A8FB7]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Senha</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/30 focus:border-[#3A8FB7]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3A8FB7] hover:bg-[#2f7aa0] text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
