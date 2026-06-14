import { memo } from 'react'
import AttendanceCard from './AttendanceCard'
import { getRowId } from '@/lib/central/rowId'

function AttendanceList({
  dados,
  selecionado,
  setSelecionado,
  loading,
}: any) {
  return (
    <div className="overflow-y-auto pr-1 space-y-3">

      {loading && (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
          Carregando atendimentos...
        </div>
      )}

      {!loading && dados.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
          Nenhum atendimento encontrado
        </div>
      )}

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
