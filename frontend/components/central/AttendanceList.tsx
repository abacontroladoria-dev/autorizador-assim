import { memo } from 'react'
import AttendanceCard from './AttendanceCard'
import { getRowId } from '@/lib/central/rowId'

/**
 * Lista única, cronológica. A ordenação (por horário → nome) é feita na página
 * (`filtrados`). Sem categorização: cada linha mostra seu status pela cor, mas
 * todas têm o mesmo peso e seguem a ordem do horário de atendimento.
 */
function AttendanceList({ dados, selecionado, setSelecionado, loading }: any) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!dados.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
        <p className="text-sm font-medium text-slate-500">
          Nenhum atendimento nesta data
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Ajuste a data ou os filtros acima.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {dados.map((item: any) => {
        const rowId = getRowId(item)
        return (
          <AttendanceCard
            key={rowId}
            item={item}
            rowId={rowId}
            ativo={selecionado === rowId}
            onSelect={setSelecionado}
          />
        )
      })}
    </div>
  )
}

export default memo(AttendanceList)
