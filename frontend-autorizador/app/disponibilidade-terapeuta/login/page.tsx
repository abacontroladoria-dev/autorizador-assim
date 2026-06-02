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

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
            <img
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-tight">Clínica Universo ABA</p>
            <p className="text-sm font-semibold text-[#3A8FB7] leading-tight">Registro de Disponibilidade</p>
          </div>
        </div>
      </header>

      {/* ── Centered card ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          {/* Zone 1 — purpose */}
          <div className="px-8 pt-8 pb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Entrar</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Acesso exclusivo para registro de disponibilidade
            </p>
          </div>

          {/* Zone divider */}
          <div className="h-px bg-slate-100" />

          {/* Zone 2 — credentials */}
          <form onSubmit={handleLogin} className="px-8 pt-6 pb-8 space-y-5">

            {erro && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"
              >
                {erro}
              </div>
            )}

            <div>
              <label
                htmlFor="login-input"
                className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5"
              >
                Login
              </label>
              <input
                id="login-input"
                type="text"
                placeholder="E-mail ou usuário"
                value={login}
                autoComplete="username"
                onChange={(e) => setLogin(e.target.value.toLowerCase())}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/30 focus:border-[#3A8FB7] transition"
              />
            </div>

            <div>
              <label
                htmlFor="senha-input"
                className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="senha-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Senha"
                  value={senha}
                  autoComplete="current-password"
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/30 focus:border-[#3A8FB7] transition"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 h-full px-3 flex items-center text-slate-400 hover:text-slate-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A8FB7] rounded-r-xl"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#3A8FB7] hover:bg-[#2f7aa0] text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7] focus:ring-offset-2"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>

          </form>
        </div>
      </div>

    </main>
  )
}
