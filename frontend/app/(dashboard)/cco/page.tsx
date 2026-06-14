'use client'

import { useState } from 'react'
import AcaoImediata from '@/components/cco/AcaoImediata'
import Acompanhamento from '@/components/cco/Acompanhamento'
import AcoesRapidas from '@/components/cco/AcoesRapidas'
import CCOKpiCards from '@/components/cco/CCOKpiCards'
import OcorrenciasRevisaoDrawer from '@/components/cco/OcorrenciasRevisaoDrawer'
import TopTerapeutasPendencias from '@/components/cco/TopTerapeutasPendencias'
import PacientesComPendencias from '@/components/cco/PacientesComPendencias'
import PacientesPendenciasModal from '@/components/cco/PacientesPendenciasModal'
import PacientesRevisaoModal from '@/components/cco/PacientesRevisaoModal'
import PacienteDetalhesModal from '@/components/cco/PacienteDetalhesModal'
import PeriodoCalendar from '@/components/cco/PeriodoCalendar'
import { useCCO } from '@/hooks/useCCO'
import type { CCOSessaoDetalhada } from '@/components/cco/types'

export default function CCOPage() {
  const [dataInicio, setDataInicio] = useState('2026-06-01')
  const [dataFim, setDataFim] = useState('2026-06-30')
  const { dados, loading } = useCCO(dataInicio, dataFim)
  const [revisaoDrawerOpen, setRevisaoDrawerOpen] = useState(false)
  const [pendenciasModalOpen, setPendenciasModalOpen] = useState(false)
  const [revisaoModalOpen, setRevisaoModalOpen] = useState(false)
  const [detalhesModalOpen, setDetalhesModalOpen] = useState(false)
  const [pacienteDetalhes, setPacienteDetalhes] = useState<string | null>(null)

  const abrirDetalhes = (nomePaciente: string) => {
    setPacienteDetalhes(nomePaciente)
    setDetalhesModalOpen(true)
  }

  const fecharDetalhes = () => {
    setDetalhesModalOpen(false)
    setPacienteDetalhes(null)
  }


  return (
    <div className="flex flex-col gap-8">

      {/* Header & Period Filter */}
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Central de Conciliação ASSIM</h1>
          <p className="text-sm text-foreground/60">Convênio ASSIM · Unidade 280</p>
        </div>
        <PeriodoCalendar
          dataInicio={dataInicio}
          dataFim={dataFim}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
        />
      </div>

      {/* KPI Cards */}
      <div className="space-y-3">
        <CCOKpiCards
          kpis={dados?.kpis ?? {
            pacientes_conciliados: 0,
            pacientes_pendentes: 0,
            pacientes_em_revisao: 0,
            total_pacientes: 0,
            sessoes_prontas: 0,
            sessoes_pendentes: 0,
            sessoes_em_revisao: 0,
            total_sessoes: 0,
            evolucoes_pendentes: 0,
            evolucoes_atrasadas: 0,
            total_pacientes_assim: 0,
            total_sessoes_assim: 0,
          }}
          loading={loading}
        />
      </div>

      {/* Ação Imediata & Acompanhamento & Ações Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr] gap-6">
        <AcaoImediata
          pacientes={dados?.pacientesAcaoImediata ?? []}
          loading={loading}
          onPacienteClick={abrirDetalhes}
        />
        <Acompanhamento
          pacientes={dados?.pacientesAcompanhamento ?? []}
          loading={loading}
          onPacienteClick={abrirDetalhes}
        />
        <AcoesRapidas />
      </div>

      {/* Pacientes com Pendências + Top 10 Terapeutas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <PacientesComPendencias
            pacientes={dados?.pacientesComPendencias ?? []}
            loading={loading}
            onPacienteClick={abrirDetalhes}
          />
          <TopTerapeutasPendencias
            terapeutas={dados?.topTerapeutasComPendencias ?? []}
            loading={loading}
          />
      </div>

      {/* Modals */}
      <PacientesPendenciasModal
        open={pendenciasModalOpen}
        onClose={() => setPendenciasModalOpen(false)}
        pacientes={dados?.pacientesComPendencias ?? []}
        onPacienteClick={abrirDetalhes}
      />

      <PacientesRevisaoModal
        open={revisaoModalOpen}
        onClose={() => setRevisaoModalOpen(false)}
        sessoes={dados?.sessoesRevisao ?? []}
        onPacienteClick={abrirDetalhes}
      />

      <PacienteDetalhesModal
        open={detalhesModalOpen}
        onClose={fecharDetalhes}
        pacienteNome={pacienteDetalhes ?? ''}
        competencia={{ mes: parseInt(dataInicio.split('-')[1]), ano: parseInt(dataInicio.split('-')[0]) }}
        sessoes={(() => {
          const sessoes: CCOSessaoDetalhada[] = []
          if (dados?.pacientesSessoes) {
            Object.values(dados.pacientesSessoes).forEach(s => sessoes.push(...s))
          }
          return sessoes
        })()}
      />

      {/* Ocorrências em Revisão — Drawer */}
      <OcorrenciasRevisaoDrawer
        open={revisaoDrawerOpen}
        onClose={() => setRevisaoDrawerOpen(false)}
        sessoes={dados?.sessoesRevisao ?? []}
      />

    </div>
  )
}
