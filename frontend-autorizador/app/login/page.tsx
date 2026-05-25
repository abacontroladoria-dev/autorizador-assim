"use client";

import { useEffect, useState } from "react"
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
  const [checking, setChecking] = useState(true)

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
        setErro("Usuário não encontrado");
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
      setErro("Login ou senha inválidos");
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

    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return

      if (user) {
        const { data: perfil } = await supabase
          .from('usuarios')
          .select('role')
          .eq('id', user.id)
          .single()

        if (perfil?.role === 'disponibilidade_terapeuta') {
          router.replace('/disponibilidade-terapeuta/')
        } else {
          router.replace("/")
        }
      } else {
        setChecking(false)
      }
    }

    checkUser()
    return () => { mounted = false }
  }, [])

  if (checking) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl">

        <div className="flex justify-center mb-4">
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="h-32 object-contain drop-shadow-sm"
          />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-800">
            Central de Autorizações
          </h1>
          <p className="text-sm text-gray-500">
            GESTAO_CLINICA • Sistema interno
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              {erro}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Login
            </label>
            <input
              type="text"
              placeholder="E-mail ou usuário"
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Senha
            </label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3A8FB7] hover:bg-[#2f7aa0] text-white py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

        </form>
      </div>
    </div>
  );
}
