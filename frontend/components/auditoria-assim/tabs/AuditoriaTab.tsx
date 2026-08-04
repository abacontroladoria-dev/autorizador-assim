'use client'

import { useAuditoriaAssim } from '@/hooks/useAuditoriaAssim'
import KpiCards from '@/components/auditoria-assim/KpiCards'
import FiltrosAuditoria from '@/components/auditoria-assim/FiltrosAuditoria'
import TabelaAuditoria from '@/components/auditoria-assim/TabelaAuditoria'

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

  return (
    <div className="bg-card rounded-2xl">
      <div className="flex flex-col gap-4 overflow-hidden">

        <KpiCards
          kpis={kpis}
          loading={loading}
          activeFilter={filters.situacao}
          onFilter={(situacao) => setFilters({ ...filters, situacao })}
        />

        <FiltrosAuditoria filters={filters} onChange={setFilters} />

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
        />

      </div>
    </div>
  )
}
