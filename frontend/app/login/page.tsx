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
      className="min-h-dvh flex items-center justify-center relative px-4 py-8 overflow-hidden"
      style={{ background: "radial-gradient(ellipse 140% 100% at 60% 50%, #2a6080 0%, #1a3a55 50%, #0f2540 100%)" }}
    >
      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(58,143,183,0.10) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          WebkitMaskImage: "radial-gradient(ellipse 110% 90% at 50% 50%, black 30%, transparent 85%)",
          maskImage: "radial-gradient(ellipse 110% 90% at 50% 50%, black 30%, transparent 85%)",
        }}
      />

      {/* Large white card */}
      <div
        className="relative w-full max-w-4xl rounded-3xl overflow-hidden bg-white"
        style={{
          boxShadow: "0 8px 16px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.35), 0 64px 120px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        {/* Top light reflection */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0"
          style={{ height: "1px", background: "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.6) 50%, transparent 95%)" }}
        />

        <div className="flex flex-col md:flex-row min-h-[520px]">

          {/* Left column — logo / branding */}
          <div
            className="flex flex-col items-center justify-center md:w-2/5 px-8 py-12 md:py-16"
            style={{ background: "linear-gradient(160deg, #f0f7fc 0%, #e3f0f9 100%)" }}
          >
            <Image
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              width={220}
              height={140}
              priority
              sizes="(max-width: 767px) 160px, 220px"
              className="w-40 md:w-52 h-auto object-contain drop-shadow-sm"
            />
            <p className="mt-6 text-sm text-slate-400 text-center select-none tracking-wide">
              Sistema de Gestão Clínica
            </p>
          </div>

          {/* Right column — form */}
          <div className="flex flex-col justify-center md:w-3/5 px-8 sm:px-12 py-12 md:py-16">

            <div className="mb-8">
              <h1 id="page-title" className="text-3xl font-bold text-slate-800 leading-tight">
                Acesso ao<br />Sistema PULSAR
              </h1>
              <p className="mt-2 text-base text-slate-500">
                Digite suas credenciais para entrar
              </p>
            </div>

            <form onSubmit={handleLogin} aria-labelledby="page-title" className="space-y-5">

              {erro && (
                <div
                  id="login-error"
                  role="alert"
                  className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl"
                >
                  {erro}
                </div>
              )}

              {/* Usuário */}
              <div>
                <label htmlFor="login-field" className="text-sm font-semibold text-slate-700">
                  Usuário ou e-mail <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 pointer-events-none">
                    <User size={17} aria-hidden="true" />
                  </span>
                  <input
                    id="login-field"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={login}
                    onChange={(e) => setLogin(e.target.value.toLowerCase())}
                    placeholder="seu.usuario ou email@universoaba.com.br"
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={erro ? "login-error" : undefined}
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label htmlFor="senha-field" className="text-sm font-semibold text-slate-700">
                  Senha <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 pointer-events-none">
                    <Lock size={17} aria-hidden="true" />
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
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-12 py-3.5 text-base text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 pl-2 text-slate-400 hover:text-slate-600 active:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand rounded-r-xl transition-colors"
                  >
                    {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Botão */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-13 bg-brand hover:bg-brand-dark active:opacity-90 text-white rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                >
                  {loading ? "Entrando…" : (<><span>Entrar</span><ArrowRight size={18} aria-hidden="true" /></>)}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500/60 select-none whitespace-nowrap">
        Universo ABA — Sistema de Gestão Clínica
      </p>
    </main>
  );
}
