'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSupabaseClient } from '@/lib/supabase/client'
import { getFunctionHeaders, getFunctionUrl } from '@/lib/supabase/functions'
import { normalizarParaUsername } from '@/lib/username'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const usernameRegex = /^[a-zA-Z0-9._-]+$/

function DefinirSenhaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getSupabaseClient()

  const [checking, setChecking] = useState(true)
  const [expired, setExpired] = useState(false)
  const [nome, setNome] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function preencherUsername(uid: string) {
    const { data } = await supabase.from('usuarios').select('nome').eq('id', uid).maybeSingle()
    const sugestao = normalizarParaUsername(data?.nome ?? '')
    if (sugestao.length >= 3 && usernameRegex.test(sugestao)) {
      setUsername(sugestao)
    }
  }

  useEffect(() => {

  supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    setNome(
      data.session.user.user_metadata?.nome ??
      data.session.user.email ??
      ''
    )
    preencherUsername(data.session.user.id)
    setUserId(data.session.user.id)
    setExpired(false)
    setChecking(false)
  }
  })

    // Apenas registra erros, sem invalidar imediatamente
    const error = searchParams.get('error')

    if (error) {
      console.error('Auth error:', error)
    }


    // PKCE code landed directly on this page (e.g. redirectTo pointed here)
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }: { error: Error | null }) => {
        if (error) {
          setExpired(true)
          setChecking(false)
        }
        // On success, SIGNED_IN will fire via onAuthStateChange below
      })
    }

    // onAuthStateChange handles:
    // - INITIAL_SESSION: existing session (PKCE via /auth/callback) or no session
    // - SIGNED_IN: implicit flow (Supabase JS auto-processes #access_token= hash on init)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_IN' && session) {
          setNome(session.user.user_metadata?.nome ?? session.user.email ?? '')
          preencherUsername(session.user.id)
          setUserId(session.user.id)
          setExpired(false)
          setChecking(false)
        } else if (event === 'INITIAL_SESSION') {
          if (session) {
            setNome(session.user.user_metadata?.nome ?? session.user.email ?? '')
            preencherUsername(session.user.id)
            setUserId(session.user.id)
            setChecking(false)
          } else if (!code) {
            // No session and no code being exchanged → expired
            setExpired(true)
            setChecking(false)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  function handleUsernameChange(value: string) {
    const lower = value.toLowerCase()
    setUsername(lower)

    if (lower.length > 0 && lower.length < 3) {
      setUsernameError('Mínimo 3 caracteres')
    } else if (lower.length > 0 && !usernameRegex.test(lower)) {
      setUsernameError('Apenas letras, números, ponto, _ ou -')
    } else {
      setUsernameError('')
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!username || username.length < 3) {
      toast.error('Informe um nome de usuário com pelo menos 3 caracteres.')
      return
    }
    if (!usernameRegex.test(username)) {
      toast.error('Usuário inválido. Use letras, números, ponto, _ ou -')
      return
    }
    if (password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem.')
      return
    }

    setLoading(true)

    try {
      const { error: passError } = await supabase.auth.updateUser({ password })
      if (passError) throw passError

      const setupRes = await fetch(getFunctionUrl('auth-complete-setup'), {
        method: 'POST',
        headers: await getFunctionHeaders(),
        body: JSON.stringify({ username }),
      })

      if (!setupRes.ok) {
        const setupJson = await setupRes.json()
        throw new Error(
          setupJson.error === 'username_taken'
            ? 'Este usuário já está em uso. Escolha outro.'
            : setupJson.message ?? 'Erro ao salvar perfil. Tente novamente.'
        )
      }

      toast.success('Cadastro concluído! Redirecionando...')
      setTimeout(() => router.replace('/'), 1500)
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao finalizar cadastro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength =
    password.length === 0
      ? null
      : password.length < 6
      ? { label: 'Muito curta', color: 'bg-red-400', width: 'w-1/4' }
      : password.length < 8
      ? { label: 'Quase lá', color: 'bg-amber-400', width: 'w-2/4' }
      : password.length < 12
      ? { label: 'Boa', color: 'bg-[#3A8FB7]', width: 'w-3/4' }
      : { label: 'Forte', color: 'bg-emerald-500', width: 'w-full' }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-[#3A8FB7]" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">

        <div className="mb-8 text-center">
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="mx-auto mb-6 h-16 object-contain"
          />

          {expired ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <ShieldAlert className="h-7 w-7 text-red-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">Link expirado</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Este link de acesso não é mais válido.
                <br />
                Solicite um novo convite ao administrador.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="mt-6 w-full rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Ir para o login
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-800">
                {nome ? `Olá, ${nome.split(' ')[0]}!` : 'Bem-vindo!'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Crie seu usuário e senha para acessar o sistema.
              </p>
            </>
          )}
        </div>

        {!expired && (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* USERNAME */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Usuário
              </label>
              <input
                type="text"
                autoComplete="off"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="ex: joao.silva"
                required
                className={`w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 ${
                  usernameError
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 focus:border-[#3A8FB7] focus:ring-[#3A8FB7]/20'
                }`}
              />
              {usernameError && (
                <p className="mt-1 text-xs text-red-500">{usernameError}</p>
              )}
            </div>

            {/* NOVA SENHA */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Nova senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {passwordStrength && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color} ${passwordStrength.width}`}
                    />
                  </div>
                  <p className="text-xs text-slate-400">{passwordStrength.label}</p>
                </div>
              )}
            </div>

            {/* CONFIRMAR SENHA */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/20"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !!usernameError}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3A8FB7] py-3 text-sm font-medium text-white transition hover:bg-[#2f7da0] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Finalizar cadastro'
              )}
            </button>

          </form>
        )}
      </div>
    </div>
  )
}

export default function DefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
          <Loader2 className="h-6 w-6 animate-spin text-[#3A8FB7]" />
        </div>
      }
    >
      <DefinirSenhaContent />
    </Suspense>
  )
}
