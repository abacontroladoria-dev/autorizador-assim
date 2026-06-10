"use client";

import { useEffect, useState } from "react"
import Image from "next/image"
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFunctionUrl } from "@/lib/supabase/functions";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();
  const supabase = getSupabaseClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    let emailToUse = login;

    if (!login.includes("@")) {
      const res = await fetch(getFunctionUrl('auth-lookup-username'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: login.toLowerCase() }),
      })

      if (!res.ok) {
        setErro("Usuário não encontrado. Tente acessar com seu e-mail.");
        setLoading(false);
        return;
      }

      const { email } = await res.json()
      emailToUse = email
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: senha,
    });

    if (error || !data?.user) {
      setErro("Login ou senha incorretos. Verifique e tente novamente.");
      setLoading(false);
      return;
    }

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (perfil?.role === 'disponibilidade_terapeuta') {
      router.replace('/disponibilidade-terapeuta/')
    } else {
      router.replace("/")
    }
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return
      supabase
        .from('usuarios')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data: perfil }) => {
          if (!mounted) return
          if (perfil?.role === 'disponibilidade_terapeuta') {
            router.replace('/disponibilidade-terapeuta/')
          } else {
            router.replace("/")
          }
        })
    })

    return () => { mounted = false }
  }, [])

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center relative px-4 py-8 overflow-hidden"
      style={{ background: "radial-gradient(ellipse 120% 80% at 50% -10%, #2a6080 0%, #1a3a55 45%, #0f2540 100%)" }}
    >

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(58,143,183,0.10) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          WebkitMaskImage: "radial-gradient(ellipse 110% 90% at 50% 50%, black 30%, transparent 85%)",
          maskImage: "radial-gradient(ellipse 110% 90% at 50% 50%, black 30%, transparent 85%)",
        }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-3xl rounded-3xl overflow-hidden"
        style={{
          boxShadow: [
            "0 4px 8px rgba(0,0,0,0.15)",
            "0 12px 24px rgba(0,0,0,0.3)",
            "0 32px 56px rgba(0,0,0,0.45)",
            "0 64px 100px rgba(0,0,0,0.5)",
            "0 0 0 1px rgba(255,255,255,0.09)",
            "0 0 80px rgba(58,143,183,0.1)",
          ].join(", "),
        }}
      >

        {/* Reflexo de luz no topo */}
        <div
          className="pointer-events-none"
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.55) 50%, transparent 95%)",
          }}
        />

        <div className="grid sm:grid-cols-[5fr_7fr]">

          {/* Painel esquerdo: logo com gradiente elegante */}
          <div
            className="hidden sm:flex flex-col items-center justify-center gap-4 p-10"
            style={{
              background: "linear-gradient(135deg, #e6f2f9 0%, #dfe8f5 45%, #f0e8f9 100%)",
              borderRight: "1px solid rgba(58, 143, 183, 0.15)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {/* Efeito de luz sutil - roxo */}
            <div
              style={{
                position: "absolute",
                top: "-40%",
                right: "-10%",
                width: "200px",
                height: "200px",
                background: "radial-gradient(circle, rgba(138, 43, 226, 0.06) 0%, transparent 70%)",
                pointerEvents: "none"
              }}
            />
            {/* Efeito de luz sutil - azul */}
            <div
              style={{
                position: "absolute",
                bottom: "-20%",
                left: "-5%",
                width: "150px",
                height: "150px",
                background: "radial-gradient(circle, rgba(58, 143, 183, 0.05) 0%, transparent 70%)",
                pointerEvents: "none"
              }}
            />
            <Image
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              width={220}
              height={140}
              priority
              sizes="200px"
              className="w-44 h-auto object-contain drop-shadow-sm relative z-10"
            />
          </div>

          {/* Painel direito: formulário com fundo limpo */}
          <div
            className="px-8 sm:px-10 pt-8 pb-10 relative"
            style={{
              backgroundColor: '#FFFFFF',
              background: "linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)"
            }}
          >

            {/* Logo mobile */}
            <div className="flex justify-center mb-6 sm:hidden">
              <Image
                src="/logo-universo-aba.png"
                alt="Universo ABA"
                width={160}
                height={100}
                priority
                className="h-20 w-auto object-contain"
              />
            </div>

            <div className="mb-7">
              <h1 id="page-title" className="text-2xl font-bold text-balance leading-tight" style={{ color: '#1e5a7d' }}>
                Sistema PULSAR
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: '#6b7280' }}>
                Clínica Universo ABA
              </p>
            </div>

            <form onSubmit={handleLogin} aria-labelledby="page-title" className="space-y-5">

              {erro && (
                <div
                  id="login-error"
                  role="alert"
                  className="border text-sm px-4 py-3 rounded-xl font-medium"
                  style={{
                    backgroundColor: '#fef2f2',
                    borderColor: '#fecaca',
                    color: '#dc2626',
                  }}
                >
                  {erro}
                </div>
              )}

              {/* Usuário */}
              <div>
                <label htmlFor="login-field" className="text-sm font-semibold" style={{ color: '#1e5a7d' }}>
                  Usuário ou e-mail
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none" style={{ color: '#3a8fb7' }}>
                    <User size={18} aria-hidden="true" />
                  </span>
                  <input
                    id="login-field"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={login}
                    onChange={(e) => setLogin(e.target.value.toLowerCase())}
                    placeholder="usuario ou e-mail"
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={erro ? "login-error" : undefined}
                    className="w-full rounded-xl pl-11 pr-4 py-3.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-all"
                    style={{
                      border: '1.5px solid #e0e7ff',
                      backgroundColor: '#f9fbfd',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3a8fb7';
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(58, 143, 183, 0.1)';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e0e7ff';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.backgroundColor = '#f9fbfd';
                    }}
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label htmlFor="senha-field" className="text-sm font-semibold" style={{ color: '#1e5a7d' }}>
                  Senha
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none" style={{ color: '#3a8fb7' }}>
                    <Lock size={18} aria-hidden="true" />
                  </span>
                  <input
                    id="senha-field"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••"
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={erro ? "login-error" : undefined}
                    className="w-full rounded-xl pl-11 pr-12 py-3.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-all"
                    style={{
                      border: '1.5px solid #e0e7ff',
                      backgroundColor: '#f9fbfd',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3a8fb7';
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(58, 143, 183, 0.1)';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e0e7ff';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.backgroundColor = '#f9fbfd';
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 pl-2 hover:opacity-75 active:opacity-60 focus:outline-none focus:ring-2 rounded-r-xl transition-all"
                    style={{ color: '#3a8fb7' }}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Botão */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-13 text-white rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{
                    background: 'linear-gradient(135deg, #2a8ba8 0%, #1e5a7d 100%)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #1e7a96 0%, #164a6a 100%)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(42, 139, 168, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #2a8ba8 0%, #1e5a7d 100%)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 0 2px white, 0 0 0 4px #3a8fb7';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {loading ? "Entrando…" : (<><span>Acessar Sistema</span><ArrowRight size={18} aria-hidden="true" /></>)}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>

      <p className="relative mt-5 text-xs text-white/55 select-none tracking-wide">Universo ABA — Sistema de Gestão Clínica</p>
    </main>
  );
}
