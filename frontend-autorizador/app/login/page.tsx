"use client";

import { useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();
  const supabase = getSupabaseClient()  
  
  async function handleLogin(e: any) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro("Login ou senha inválidos");
      setLoading(false);
      return;
    }
	  const { data } = await supabase.auth.getSession()
	  console.log("SESSION:", data)

    router.replace("/home")
  }

	useEffect(() => {
	  async function checkUser() {
		const {
		  data: { user },
		} = await supabase.auth.getUser()

		if (user) {
		  window.location.href = "/home"
		}
	  }

	  checkUser()
	}, [router])


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
      
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
            ASSIM Saúde • Sistema interno
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
              type="email"
              placeholder="Usuário"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
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