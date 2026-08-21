'use client'

import { useState } from 'react'
import { useAuditoriaAssim } from '@/hooks/useAuditoriaAssim'
import KpiCards from '@/components/auditoria-assim/KpiCards'
import FiltrosAuditoria from '@/components/auditoria-assim/FiltrosAuditoria'
import TabelaAuditoria from '@/components/auditoria-assim/TabelaAuditoria'
import ModalAnaliseReincidencia from '@/components/auditoria-assim/ModalAnaliseReincidencia'
import type { AlvoAnalise } from '@/components/auditoria-assim/types'

/**
 * Aba Auditoria — a visão analítica e de conferência.
 *
 * Conteúdo movido VERBATIM do antigo app/(dashboard)/auditoria-assim/page.tsx.
 * Nenhuma mudança de comportamento: mesmos KPIs, filtros, tabela, ordenação,
 * paginação e modal de glosa. A única diferença é que o título do header agora é
 * definido pelo Shell, não aqui.
 */
export default function AuditoriaTab() {
  const {
    dados,
    kpis,
    loading,
    filters,
    setFilters,
    pagina,
    setPagina,
    totalPaginas,
    totalFiltrados,
    sortKey,
    sortDir,
    setSort,
    carregarDados,
  } = useAuditoriaAssim()

  // A Análise de Reincidência vive aqui, e não dentro de FiltrosAuditoria, porque
  // tem dois pontos de entrada: a barra de filtros (busca livre) e a linha em
  // glosa (já resolvida). Um estado só, um modal só — do contrário seriam duas
  // instâncias e dois focus traps possíveis ao mesmo tempo.
  const [analise, setAnalise] = useState<AlvoAnalise | null>(null)

  return (
    <div className="bg-card rounded-2xl">
      <div className="flex flex-col gap-4 overflow-hidden">

        <KpiCards
          kpis={kpis}
          loading={loading}
          activeFilter={filters.situacao}
          onFilter={(situacao) => setFilters({ ...filters, situacao })}
        />

        <FiltrosAuditoria
          filters={filters}
          onChange={setFilters}
          onAbrirAnalise={() =>
            setAnalise({
              // O texto da busca da página serve de ponto de partida, mas só vale
              // se for um paciente inteiro — o modal escolhe por nome exato.
              pacienteNome: null,
              carteirinha: null,
              data: filters.data,
            })
          }
        />

        <TabelaAuditoria
          dados={dados}
          loading={loading}
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalFiltrados={totalFiltrados}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={setSort}
          onPaginaChange={setPagina}
          onRefresh={() => carregarDados(true)}
          onAnalisarSemana={(item) =>
            setAnalise({
              pacienteNome: item.paciente_nome,
              carteirinha: item.carteirinha,
              data: item.data_atendimento ?? filters.data,
            })
          }
        />

        <ModalAnaliseReincidencia alvo={analise} onClose={() => setAnalise(null)} />

      </div>
    </div>
  )
}
