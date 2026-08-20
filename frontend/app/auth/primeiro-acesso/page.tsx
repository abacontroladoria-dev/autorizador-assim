"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"


export default function PrimeiroAcessoPage() {
  const supabase = getSupabaseClient()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  const [nome, setNome] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .single()

      if (profile) {
        setNome(profile.nome)
      }

      setChecking(false)
    }

    loadUser()
  }, [])

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault()

    setError("")

    if (!username) {
      setError("Informe um usuário.")
      return
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.")
      return
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }

    const regex = /^[a-zA-Z0-9._-]+$/

    if (!regex.test(username)) {
      setError(
        "Usuário inválido. Utilize apenas letras, números, ponto, underline ou hífen."
      )
      return
    }

    setLoading(true)

    // Verifica username existente
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle()

    if (existingUser) {
      setError("Este usuário já está em uso.")
      setLoading(false)
      return
    }

    // Atualiza senha
    const { error: passwordError } =
      await supabase.auth.updateUser({
        password,
      })

    if (passwordError) {
      setError(passwordError.message)
      setLoading(false)
      return
    }

    // Atualiza perfil
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        username,
        ativo: true,
        primeiro_acesso: false,
      })
      .eq("id", user?.id)

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        Validando acesso...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">

        <div className="mb-8 text-center">

          {/* h-28 e não h-20: ~40% da altura do arquivo é margem transparente. */}
          <img
            src="/pulsar-lockup-1920-transparent.png"
            alt="Pulsar"
            className="mx-auto mb-4 h-28 object-contain"
          />

          <h1 className="text-2xl font-bold text-slate-800">
            Primeiro acesso
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Olá, {nome}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Crie seu usuário e senha para acessar o sistema.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >

          <div>
            <label className="mb-1 block text-sm font-medium">
              Usuário
            </label>

            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase()
                )
              }
              className="w-full rounded-lg border p-3"
              placeholder="seu.usuario"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Senha
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Confirmar senha
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              className="w-full rounded-lg border p-3"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 p-3 font-medium text-white hover:bg-blue-700"
          >
            {loading
              ? "Finalizando..."
              : "Finalizar cadastro"}
          </button>

        </form>

      </div>

    </div>
  )
}