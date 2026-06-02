"use client";

import { useEffect, useState } from "react"
import Image from "next/image"
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFunctionUrl } from "@/lib/supabase/functions";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

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
    <main className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg px-4 py-6">
      <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">

        <div className="flex justify-center mb-4">
          <Image
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            width={200}
            height={128}
            priority
            sizes="(max-width: 639px) 125px, 175px"
            className="h-20 sm:h-28 w-auto object-contain drop-shadow-sm"
          />
        </div>

        <div className="text-center mb-6">
          <h1 id="page-title" className="text-xl font-semibold text-slate-800 text-balance">
            Central de Autorizações
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Clínica Universo ABA · Sistema interno
          </p>
        </div>

        <form onSubmit={handleLogin} aria-labelledby="page-title" className="space-y-4">

          {erro && (
            <div
              id="login-error"
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-lg"
            >
              {erro}
            </div>
          )}

          <div>
            <label
              htmlFor="login-field"
              className="text-xs font-semibold text-slate-600"
            >
              Usuário ou e-mail
            </label>
            <input
              id="login-field"
              type="text"
              autoComplete="username"
              autoFocus
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? "login-error" : undefined}
              className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="senha-field"
              className="text-xs font-semibold text-slate-600"
            >
              Senha
            </label>
            <div className="relative mt-1">
              <input
                id="senha-field"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "login-error" : undefined}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-400 transition-colors"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 pl-2 text-slate-400 hover:text-slate-600 active:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand rounded-r-xl transition-colors"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-brand hover:bg-brand-dark active:opacity-90 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}
