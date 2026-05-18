"use client";

import { useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFunctionHeaders, getFunctionUrl } from "@/lib/supabase/functions";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  // Se não for email, buscar pelo username
  if (!login.includes("@")) {

    const { data: usuario, error: erroUsuario } = await supabase
      .from("usuarios")
      .select("email")
      .eq("username", login.toLowerCase())
      .maybeSingle();

    if (erroUsuario || !usuario) {
      setErro("Usuário não encontrado");
      setLoading(false);
      return;
    }

    emailToUse = usuario.email;
  }

  // Login Supabase
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: senha,
    });

  if (error) {
    setErro("Login ou senha inválidos");
    setLoading(false);
    return;
  }

	const user = data?.user;

	if (!user) {
	  setErro("Usuário inválido");
	  setLoading(false);
	  return;
	}

  // Verifica perfil
  const perfilResponse = await fetch(
    getFunctionUrl("verify-perfil"),
    {
      method: "POST",
      headers: await getFunctionHeaders(),
    }
  );

  const perfilJson = await perfilResponse.json();

  if (!perfilResponse.ok) {

    if (perfilJson?.error === "user_inactive") {

      setErro("Usuário desativado");

    } else if (
      perfilJson?.error === "profile_not_found"
    ) {

      setErro(
        "Perfil de usuário não encontrado. Contate o administrador."
      );

    } else {

      setErro("Erro ao buscar perfil de usuário");

    }

    setLoading(false);
    return;
  }

	// Verifica primeiro acesso
	if (perfilJson?.primeiro_acesso) {

	  router.replace("/auth/primeiro-acesso");

	  setLoading(false);

	  return;
	}

  // Verifica máquina vinculada
  const {
    data: maquina,
    error: erroMaquina,
  } = await supabase
    .from("maquinas")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (erroMaquina || !maquina) {

    console.error(
      "Usuário sem máquina vinculada",
      erroMaquina
    );

    setErro(
      "Usuário não vinculado a uma máquina. Fale com o administrador."
    );

    setLoading(false);

    return;
  }

  // Atualiza last_seen
  const { error: erroUpdate } = await supabase
    .from("maquinas")
    .update({
      last_seen: new Date().toISOString(),
    })
    .eq("id", maquina.id);

  if (erroUpdate) {
    console.error(
      "Erro ao atualizar last_seen",
      erroUpdate
    );
  }

  router.replace("/");
}

	useEffect(() => {
	  let mounted = true

	  async function checkUser() {
		const { data: { user } } = await supabase.auth.getUser()

		if (!mounted) return

		if (user) {

		  const perfilResponse = await fetch(
			getFunctionUrl("verify-perfil"),
			{
			  method: "POST",
			  headers: await getFunctionHeaders(),
			}
		  )
		  const perfilJson = await perfilResponse.json()

		  if (perfilJson?.primeiro_acesso) {

			router.replace("/auth/primeiro-acesso")

		  } else {

			router.replace("/")

		  }

		} else {
		setChecking(false) }
	  }

	  checkUser()

	  return () => {
		mounted = false
	  }
	}, [])

	if (checking) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl">
        
        {/* LOGO */}
        <div className="flex justify-center mb-4">
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="h-32 object-contain drop-shadow-sm"
          />
        </div>

        {/* TÍTULO */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-800">
            Central de Autorizações
          </h1>
          <p className="text-sm text-gray-500">
            GESTAO_CLINICA • Sistema interno
          </p>
        </div>

        {/* FORM */}
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* ERRO */}
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              {erro}
            </div>
          )}

          {/* USUÁRIO */}
			<div>
			  <label className="text-xs font-semibold text-gray-500 uppercase">
				Login
			  </label>

			  <input
				type="text"
				placeholder="E-mail ou usuário"
				value={login}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
				  setLogin(e.target.value.toLowerCase())
				}
				className="mt-1 w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
			  />
			</div>

          {/* SENHA */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Senha
            </label>

            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={senha}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSenha(e.target.value)
                }
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

          {/* BOTÃO */}
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