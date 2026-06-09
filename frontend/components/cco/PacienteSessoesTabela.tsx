'use client'

import { CheckCircle, AlertTriangle } from 'lucide-react'
import type { CCOSessaoDetalhada } from './types'

interface Props {
  sessoes: CCOSessaoDetalhada[]
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

function formatDataCompleta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function getStatusIcon(status: string) {
  if (status === 'EVOLUIDA') {
    return <CheckCircle size={16} className="text-green-600" />
  }
  return <AlertTriangle size={16} className="text-amber-600" />
}

function getStatusLabel(status: string): string {
  return status === 'EVOLUIDA' ? 'Evoluída' : 'Pendente'
}

export default function PacienteSessoesTabela({ sessoes }: Props) {
  if (sessoes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-foreground/60">Nenhuma sessão registrada</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-foreground/2 border-b border-border">
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 whitespace-nowrap text-xs uppercase tracking-wide">Data</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 whitespace-nowrap text-xs uppercase tracking-wide">Horário</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 text-xs uppercase tracking-wide">Terapia</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 text-xs uppercase tracking-wide">Profissional</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 whitespace-nowrap text-xs uppercase tracking-wide">Status</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 text-xs uppercase tracking-wide">Evoluído por</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 whitespace-nowrap text-xs uppercase tracking-wide">Data Evol.</th>
            <th className="text-left px-5 py-3.5 font-bold text-foreground/80 text-xs uppercase tracking-wide">Ocorrências</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((sessao, idx) => (
            <tr key={sessao.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-foreground/1'} border-b border-border/40 hover:bg-blue-50/30 transition-colors`}>
              <td className="px-5 py-4 whitespace-nowrap text-foreground font-semibold">{formatData(sessao.data)}</td>
              <td className="px-5 py-4 whitespace-nowrap text-foreground/70 font-medium">{sessao.horario}</td>
              <td className="px-5 py-4 text-foreground font-medium">{sessao.terapia}</td>
              <td className="px-5 py-4 text-foreground">{sessao.profissional || '-'}</td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(sessao.evolucaoStatus)}
                  <span className={sessao.evolucaoStatus === 'EVOLUIDA' ? 'text-green-600 font-semibold text-xs' : 'text-amber-600 font-semibold text-xs'}>
                    {getStatusLabel(sessao.evolucaoStatus)}
                  </span>
                </div>
              </td>
              <td className="px-5 py-4 text-foreground">{sessao.evolucaoAutor || '-'}</td>
              <td className="px-5 py-4 whitespace-nowrap text-foreground/70 text-xs">
                {sessao.evolucaoDataHora ? formatDataCompleta(sessao.evolucaoDataHora.split(' ')[0]) : '-'}
              </td>
              <td className="px-5 py-4 text-foreground/70 text-xs">
                {sessao.substituicao ? 'Substituição' : sessao.glosa ? 'Glosa' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
