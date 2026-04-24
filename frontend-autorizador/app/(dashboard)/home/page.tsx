"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Home() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  const [nome, setNome] = useState("Usuário");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      // pega nome do email (provisório)
      const email = user.email || "";
      const nomeFormatado = email.split("@")[0];
      setNome(nomeFormatado);

      setLoading(false);
    }

    loadUser();
  }, []);

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-6">
      
      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">
            👋 Bem-vindo, {nome}
          </h1>
          <p className="text-sm text-gray-500">
            Central de Autorizações • ASSIM Saúde
          </p>
        </div>

        <div className="text-sm text-gray-500">
          {dataAtual}
        </div>
      </div>

      {/* DASHBOARD */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-xs text-gray-500">Pendentes</p>
          <h2 className="text-2xl font-bold text-yellow-600">12</h2>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-xs text-gray-500">Aprovadas hoje</p>
          <h2 className="text-2xl font-bold text-green-600">5</h2>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-xs text-gray-500">Recusadas</p>
          <h2 className="text-2xl font-bold text-red-600">2</h2>
        </div>

      </div>

      {/* AÇÕES */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        
        <button
          onClick={() => router.push("/solicitar")}
          className="bg-[#3A8FB7] hover:bg-[#2f7aa0] text-white p-6 rounded-xl shadow text-left transition"
        >
          <h3 className="text-lg font-semibold mb-1">
            + Nova Solicitação
          </h3>
          <p className="text-sm opacity-90">
            Criar uma nova solicitação de autorização
          </p>
        </button>

        <button
          onClick={() => router.push("/fila_autorizacoes")}
          className="bg-white hover:bg-gray-50 p-6 rounded-xl shadow text-left transition border"
        >
          <h3 className="text-lg font-semibold mb-1 text-gray-800">
            Ver Fila de Autorizações
          </h3>
          <p className="text-sm text-gray-500">
            Acompanhar solicitações pendentes
          </p>
        </button>

      </div>

      {/* ATIVIDADE RECENTE */}
      <div className="max-w-6xl mx-auto bg-white p-4 rounded-xl shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Atividade recente
        </h3>

        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Você criou uma solicitação há 2h</li>
          <li>• 3 autorizações aguardando análise</li>
          <li>• Última aprovação: hoje às 10:32</li>
        </ul>
      </div>

    </div>
  );
}