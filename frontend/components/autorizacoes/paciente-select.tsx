'use client'

import { useState } from 'react'

export default function PacienteSelect({ onSelect }: any) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])

  function handleBuscar(valor: string) {
    setBusca(valor)

    // MOCK TEMPORÁRIO (depois vem do Orbita)
    const mock = [
      { nome: 'Maria Silva', matricula: '123' },
      { nome: 'João Souza', matricula: '456' }
    ]

    const filtrados = mock.filter(p =>
      p.nome.toLowerCase().includes(valor.toLowerCase())
    )

    setResultados(filtrados)
  }

  return (
    <div>
      <input
        className="border p-2 w-full"
        placeholder="Buscar paciente..."
        value={busca}
        onChange={e => handleBuscar(e.target.value)}
      />

      <div className="border mt-2">
        {resultados.map((p, i) => (
          <div
            key={i}
            className="p-2 hover:bg-gray-100 cursor-pointer"
            onClick={() => onSelect(p)}
          >
            {p.nome} ({p.matricula})
          </div>
        ))}
      </div>
    </div>
  )
}