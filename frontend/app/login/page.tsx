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
          backgroundImage: "radial-gradient(circle, rgba(58,143,183,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          WebkitMaskImage: "radial-gradient(ellipse 110% 90% at 50% 40%, black 30%, transparent 85%)",
          maskImage: "radial-gradient(ellipse 110% 90% at 50% 40%, black 30%, transparent 85%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-175 h-105 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(58,143,183,0.14) 0%, transparent 65%)",
          animation: "glow-breathe 5s ease-in-out infinite",
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

          {/* Painel esquerdo: logo */}
          <div className="hidden sm:flex flex-col items-center justify-center gap-4 p-10 bg-brand-bg border-r border-brand-surface">
            <Image
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              width={200}
              height={128}
              priority
              sizes="200px"
              className="w-44 h-auto object-contain drop-shadow-sm"
            />
          </div>

          {/* Painel direito: formulário */}
          <div className="bg-white px-8 sm:px-10 pt-8 pb-10">

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
              <h1 id="page-title" className="text-2xl font-bold text-brand-fg text-balance leading-tight">
                Sistema PULSAR
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Clínica Universo ABA
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
                  Usuário ou e-mail
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-brand pointer-events-none">
                    <User size={18} aria-hidden="true" />
                  </span>
                  <input
                    id="login-field"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={login}
                    onChange={(e) => setLogin(e.target.value.toLowerCase())}
                    placeholder="usuario ou email"
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={erro ? "login-error" : undefined}
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label htmlFor="senha-field" className="text-sm font-semibold text-slate-700">
                  Senha
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-brand pointer-events-none">
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
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-12 py-3.5 text-base text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 pl-2 text-brand hover:text-brand-dark active:text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand rounded-r-xl transition-colors"
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
                  className="w-full h-13 bg-brand hover:bg-brand-dark active:opacity-90 text-white rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
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
