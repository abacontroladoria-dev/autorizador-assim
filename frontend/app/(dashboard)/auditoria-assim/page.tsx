'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import { useAuditoriaAssim } from '@/hooks/useAuditoriaAssim'
import KpiCards from '@/components/auditoria-assim/KpiCards'
import FiltrosAuditoria from '@/components/auditoria-assim/FiltrosAuditoria'
import TabelaAuditoria from '@/components/auditoria-assim/TabelaAuditoria'

export default function AuditoriaAssimPage() {
  const { setHeader } = useHeader()
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

  useEffect(() => {
    setHeader('Auditoria ASSIM', 'Controle operacional de autorizações e pendências')
  }, [setHeader])

  return (
    <div className="bg-[#f7f9fc] rounded-2xl">
      <div className="flex flex-col gap-4 overflow-hidden">

        <KpiCards
          kpis={kpis}
          loading={loading}
          activeFilter={filters.situacao}
          totalFiltrados={
            filters.situacao || filters.paciente || filters.tuss
              ? totalFiltrados
              : undefined
          }
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
