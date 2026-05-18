"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Home() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  const [nome, setNome] = useState("Usuário");
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const hoje = new Date().toISOString().split("T")[0];

  useEffect(() => {
async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  router.replace("/login");
  return;
}

  // 🔥 busca o nome na tabela maquinas
  const { data, error } = await supabase
    .from("maquinas")
    .select("nome")
    .eq("user_id", user.id)
    .limit(1);

	if (data && data.length > 0) {
	  setNome(data[0].nome);
	} else {
	  console.log("Erro ao buscar nome:", error);
	  setNome("Usuário");
	}
}

    loadUser();
  }, []);

  async function carregarDados() {
    const { data } = await supabase
      .from("fila_autorizacoes")
      .select("*")
      .eq("data_atendimento", hoje);

    if (data) setDados(data);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
    const interval = setInterval(carregarDados, 5000);
    return () => clearInterval(interval);
  }, []);

  const erro = dados.filter(d => d.status === "erro").length;
  const pendentes = dados.filter(d => d.status === "pendente").length;

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-6">

      {/* LOGO */}
      <img
        src="/logo-universo-aba.png"
        alt="Logo"
        className="w-40 mb-4"
      />

      {/* SAUDAÇÃO */}
      <h1 className="text-xl font-semibold text-gray-800 mb-1">
        Olá, {nome}
      </h1>

      <p className="text-sm text-gray-500 mb-6">
        Central de Autorizações
      </p>

      {/* BOTÃO PRINCIPAL */}
      <button
        onClick={() => router.push("/solicitar")}
        className="w-full max-w-md bg-[#3A8FB7] text-white py-4 rounded-xl font-semibold mb-4 hover:brightness-110 transition"
      >
        🚀 Iniciar Atendimentos
      </button>

      {/* STATUS */}
      <div className="mt-6 text-xs text-gray-500">
        🟢 Sistema ativo • {pendentes} em processamento • {erro} erro(s)
      </div>

    </div>
  );
}