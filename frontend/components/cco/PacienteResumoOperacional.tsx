'use client'

import type { ResumoSessoesPaciente } from './types'

interface Props {
  pacienteNome: string
  competencia: { mes: number; ano: number }
  resumo: ResumoSessoesPaciente
  statusGeral: 'CONCILIADO' | 'PENDENTE'
}

function getMotivoStatus(resumo: ResumoSessoesPaciente): string {
  if (resumo.pendentes > 0) {
    return 'Existem sessões sem evolução que precisam ser completadas.'
  }
  if (resumo.substituicoes > 0) {
    return 'Existem substituições de terapeuta pendentes.'
  }
  if (resumo.glosas > 0) {
    return 'Existem glosas que impedem a conciliação.'
  }
  return 'Todas as sessões foram conciliadas com sucesso.'
}

export default function PacienteResumoOperacional({
  pacienteNome,
  competencia,
  resumo,
  statusGeral,
}: Props) {
  const motivosPendencias: string[] = []
  if (resumo.pendentes > 0) motivosPendencias.push(`Sem evolução: ${resumo.pendentes}`)
  if (resumo.substituicoes > 0) motivosPendencias.push(`Substituição: ${resumo.substituicoes}`)
  if (resumo.glosas > 0) motivosPendencias.push(`Glosa: ${resumo.glosas}`)

  const statusColor = statusGeral === 'PENDENTE'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-green-50 text-green-700 border-green-200'

  return (
    <div className="space-y-7">
      {/* Paciente Info */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Paciente</p>
        <p className="text-xl font-bold text-foreground">{pacienteNome}</p>
      </div>

      {/* Competência */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Competência</p>
        <p className="text-xl font-bold text-foreground">
          {String(competencia.mes).padStart(2, '0')} / {competencia.ano}
        </p>
      </div>

      {/* Divisor */}
      <div className="h-px bg-border" />

      {/* Sessões */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Total de Sessões</span>
          <span className="text-2xl font-bold text-foreground">{resumo.total}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Sessões Conciliadas</span>
          <span className="text-2xl font-bold text-green-600">{resumo.evoluidas}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Sessões Pendentes</span>
          <span className="text-2xl font-bold text-amber-600">{resumo.pendentes}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Substituições</span>
          <span className="text-2xl font-bold text-blue-600">{resumo.substituicoes}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Glosas</span>
          <span className="text-2xl font-bold text-red-600">{resumo.glosas}</span>
        </div>
      </div>

      {/* Motivos das Pendências */}
      {motivosPendencias.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Motivos das Pendências</p>
            <ul className="space-y-2">
              {motivosPendencias.map((motivo, idx) => (
                <li key={idx} className="text-sm text-foreground/70 font-medium">• {motivo}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Situação Final */}
      <div className="h-px bg-border" />
      <div className="space-y-3">
        <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Situação Final</p>
        <div className={`inline-flex items-center text-xs font-bold px-4 py-2 rounded-full border uppercase tracking-wide ${statusColor}`}>
          {statusGeral}
        </div>
      </div>

      {/* Motivo Principal */}
      <div className="space-y-3 p-4 rounded-xl bg-foreground/2 border border-border">
        <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Motivo Principal</p>
        <p className="text-sm text-foreground font-medium leading-relaxed">{getMotivoStatus(resumo)}</p>
      </div>
    </div>
  )
}
