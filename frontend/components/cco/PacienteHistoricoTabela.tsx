'use client'

import type { CCOSessaoDetalhada } from './types'

interface Props {
  sessoes: CCOSessaoDetalhada[]
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function PacienteHistoricoTabela({ sessoes }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-foreground/70 py-4 px-4">Data</th>
            <th className="text-left font-medium text-foreground/70 py-4 px-4">Especialidade</th>
            <th className="text-left font-medium text-foreground/70 py-4 px-4">Profissional</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map(sessao => (
            <tr key={sessao.id} className="border-b border-border/50 hover:bg-foreground/2 transition-colors">
              <td className="py-4 px-4 font-medium text-foreground">
                {formatData(sessao.data)}
              </td>
              <td className="py-4 px-4 text-foreground/80">{sessao.terapia}</td>
              <td className="py-4 px-4 text-foreground/80">{sessao.profissional}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
