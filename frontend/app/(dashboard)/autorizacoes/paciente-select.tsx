'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

export default function PacienteSelect({ onSelect }: any) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selecionado, setSelecionado] = useState<any>(null)

  async function handleBuscar(valor: string) {
    setBusca(valor)

    if (!valor) {
      setResultados([])
      return
    }

    setLoading(true)

    // 🔥 MOCK (depois troca por API)
    const mock = [
      { nome: 'Maria Silva', matricula: '123' },
      { nome: 'João Souza', matricula: '456' }
    ]

    const filtrados = mock.filter(p =>
      p.nome.toLowerCase().includes(valor.toLowerCase())
    )

    setTimeout(() => {
      setResultados(filtrados)
      setLoading(false)
    }, 300) // simula delay
  }

  function selecionarPaciente(p: any) {
    setSelecionado(p)
    setBusca(p.nome)
    setResultados([])
    onSelect(p)
  }

  return (
    <div className="relative">

      {/* INPUT */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-2.5 text-slate-400"
        />

        <input
          className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
          placeholder="Buscar paciente..."
          value={busca}
          onChange={e => handleBuscar(e.target.value)}
        />
      </div>

      {/* DROPDOWN */}
      {(resultados.length > 0 || loading) && (
        <div className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">

          {/* LOADING */}
          {loading && (
            <div className="p-3 text-sm text-slate-400">
              Buscando...
            </div>
          )}

          {/* RESULTADOS */}
          {!loading && resultados.map((p, i) => (
            <div
              key={i}
              className="p-3 text-sm hover:bg-slate-50 cursor-pointer transition"
              onClick={() => selecionarPaciente(p)}
            >
              <div className="font-medium text-slate-800">
                {p.nome}
              </div>
              <div className="text-xs text-slate-400">
                Matrícula: {p.matricula}
              </div>
            </div>
          ))}

          {/* VAZIO */}
          {!loading && resultados.length === 0 && (
            <div className="p-3 text-sm text-slate-400">
              Nenhum paciente encontrado
            </div>
          )}

        </div>
      )}

      {/* SELECIONADO */}
      {selecionado && (
        <div className="mt-2 text-xs text-green-600">
          Paciente selecionado: {selecionado.nome}
        </div>
      )}

    </div>
  )
}