'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()
const DISPONIBILIDADE_EMAIL = 'disponibilidade@universoaba.com.br'

const BG = 'linear-gradient(160deg, #2163d5 0%, #0c3292 100%)'

export default function LoginDisponibilidadePage() {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [checking, setChecking] = useState(true)
  const [inputFocused, setInputFocused] = useState(false)

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: DISPONIBILIDADE_EMAIL,
      password: senha,
    })

    if (error || !data.user) {
      setErro('Senha incorreta')
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
      setErro('Acesso desativado')
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

  if (checking) {
    return <main className="min-h-screen" style={{ background: BG }} aria-hidden="true" />
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center py-12 px-5 relative overflow-hidden"
      style={{ background: BG }}
    >

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes imp-fade-up {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes imp-drop-in {
          from { opacity: 0; transform: translateY(-18px) scale(0.82); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes imp-shake {
          0%,100% { transform: translateX(0); }
          18%     { transform: translateX(-7px); }
          36%     { transform: translateX(7px); }
          54%     { transform: translateX(-5px); }
          72%     { transform: translateX(5px); }
          88%     { transform: translateX(-2px); }
        }

        /* Ambient ring drifts — each ring moves independently */
        @keyframes imp-ring-1 {
          from { transform: translate(0,   0)    scale(1);    }
          to   { transform: translate(-22px, 18px) scale(1.06); }
        }
        @keyframes imp-ring-2 {
          from { transform: translate(0,   0)     scale(1);    }
          to   { transform: translate(18px, -14px) scale(0.94); }
        }
        @keyframes imp-ring-3 {
          from { transform: translate(0,   0)    scale(1);    }
          to   { transform: translate(-12px, -22px) scale(1.04); }
        }

        /* Lock glow — slow outer ring after entrance */
        @keyframes imp-lock-glow {
          0%,100% { box-shadow: 0 4px 20px rgba(0,0,0,0.14), 0 0 0 0px  rgba(221,232,249,0);    }
          50%     { box-shadow: 0 4px 20px rgba(0,0,0,0.14), 0 0 0 10px rgba(221,232,249,0.35); }
        }

        .imp-branding {
          animation: imp-fade-up 580ms cubic-bezier(0.16,1,0.3,1) both;
        }
        .imp-lock {
          animation:
            imp-drop-in  480ms 160ms cubic-bezier(0.16,1,0.3,1) both,
            imp-lock-glow 3.2s  800ms ease-in-out infinite;
        }
        .imp-card {
          animation: imp-fade-up 520ms 240ms cubic-bezier(0.16,1,0.3,1) both;
        }
        .imp-footer {
          animation: imp-fade-up 360ms 420ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .imp-shake {
          animation: imp-shake 420ms cubic-bezier(0.36,0.07,0.19,0.97);
        }
        .imp-ring-1 {
          will-change: transform;
          animation: imp-ring-1 28s ease-in-out infinite alternate;
        }
        .imp-ring-2 {
          will-change: transform;
          animation: imp-ring-2 35s ease-in-out infinite alternate;
        }
        .imp-ring-3 {
          will-change: transform;
          animation: imp-ring-3 22s ease-in-out infinite alternate;
        }

        @media (prefers-reduced-motion: reduce) {
          .imp-branding,
          .imp-lock,
          .imp-card,
          .imp-footer {
            animation: none;
            opacity: 1;
            transform: none;
          }
          .imp-shake,
          .imp-ring-1,
          .imp-ring-2,
          .imp-ring-3 {
            animation: none;
          }
        }
      `}</style>

      {/* ── Decorative rings ── */}
      <div
        aria-hidden="true"
        className="imp-ring-1 pointer-events-none absolute -top-32 -right-28 w-95 h-95 rounded-full"
        style={{ border: '56px solid rgba(255,255,255,0.09)' }}
      />
      <div
        aria-hidden="true"
        className="imp-ring-2 pointer-events-none absolute top-16 -right-16 w-60 h-60 rounded-full"
        style={{ border: '40px solid rgba(255,255,255,0.06)' }}
      />
      <div
        aria-hidden="true"
        className="imp-ring-3 pointer-events-none absolute -bottom-24 -left-24 w-80 h-80 rounded-full"
        style={{ border: '50px solid rgba(255,255,255,0.07)' }}
      />

      {/* ── Branding ── */}
      <div className="imp-branding flex flex-col items-center gap-5 z-10 pt-2 pb-20 w-full">
        <div
          className="w-24 h-24 bg-white flex items-center justify-center"
          style={{ borderRadius: '26px', boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}
        >
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="w-20 h-20 object-contain"
          />
        </div>

        <div className="text-center">
          <h1 className="text-[22px] font-bold text-white tracking-tight leading-tight">
            Clínica Universo ABA
          </h1>
          <p className="text-[15px] font-medium mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Registro de Disponibilidade
          </p>
        </div>
      </div>

      {/* ── Card with floating icon ── */}
      <div className="w-full max-w-sm relative z-10 shrink-0">

        {/* Floating lock circle — drops in from above */}
        <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-20">
          <div
            className="imp-lock w-22 h-22 rounded-full flex items-center justify-center"
            style={{ background: '#dde8f9', boxShadow: '0 4px 20px rgba(0,0,0,0.14)' }}
          >
            <Lock size={34} strokeWidth={1.75} style={{ color: '#1a4fc4' }} />
          </div>
        </div>

        {/* Card — rises from below */}
        <div
          className="imp-card bg-white overflow-hidden"
          style={{ borderRadius: '26px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
        >
          {/* Heading zone */}
          <div className="px-8 pt-16 pb-4 text-center">
            <h2
              className="font-bold tracking-tight leading-none mb-3"
              style={{ fontSize: '38px', color: '#192755' }}
            >
              Acesso
            </h2>
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: '#64748b', textWrap: 'balance' } as React.CSSProperties}
            >
              Digite a senha para registrar disponibilidade
            </p>
          </div>

          {/* Form zone */}
          <form onSubmit={handleLogin} className="px-7 pt-5 pb-7 space-y-4">

            {erro && (
              <div
                key={erro}
                role="alert"
                className="imp-shake text-sm px-4 py-3 rounded-2xl"
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
              >
                {erro}
              </div>
            )}

            <div>
              <label
                htmlFor="senha-input"
                className="block font-bold uppercase tracking-widest mb-2"
                style={{ fontSize: '11px', color: '#64748b' }}
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="senha-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Senha de acesso"
                  value={senha}
                  autoComplete="current-password"
                  autoFocus
                  disabled={loading}
                  onChange={(e) => setSenha(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  className="w-full rounded-2xl px-4 py-4 pr-12 text-[15px] transition-all duration-150 focus:outline-none placeholder:text-slate-400 disabled:opacity-60"
                  style={{
                    background: inputFocused ? '#ffffff' : '#eef3fc',
                    color: '#1e293b',
                    border: inputFocused ? '1.5px solid #1a4fc4' : '1.5px solid transparent',
                    boxShadow: inputFocused ? '0 0 0 3px rgba(26,79,196,0.12)' : 'none',
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  tabIndex={0}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 h-full px-3.5 flex items-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a4fc4] rounded-r-2xl"
                  style={{ color: '#1a4fc4' }}
                >
                  {showPassword
                    ? <EyeOff size={20} strokeWidth={1.75} />
                    : <Eye size={20} strokeWidth={1.75} />
                  }
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full font-bold text-white transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fc4] focus-visible:ring-offset-2 disabled:opacity-50 bg-[#1a3275] hover:bg-[#152a68] active:bg-[#111f52] active:scale-[0.97]"
                style={{ height: '56px', borderRadius: '16px', fontSize: '16px', letterSpacing: '0.01em' }}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1 min-h-8" />

      {/* ── Footer ── */}
      <div className="imp-footer flex items-start gap-2.5 z-10 max-w-xs">
        <Lock
          size={14}
          strokeWidth={2}
          className="shrink-0 mt-0.5"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-hidden="true"
        />
        <p className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Acesso restrito. Apenas usuários autorizados podem continuar.
        </p>
      </div>

    </main>
  )
}
