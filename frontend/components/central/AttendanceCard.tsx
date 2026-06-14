import { memo } from 'react'
import StatusBadge from './StatusBadge'

function AttendanceCard({ item, rowId, ativo, onSelect }: any) {
  return (
    <button
      onClick={() => onSelect(rowId)}
      className={`
        w-full
        bg-white
        rounded-lg
        border
        px-4 py-2
        text-left
        transition-all duration-200
        hover:shadow-md
        hover:-translate-y-[1px]

        ${ativo
          ? 'border-emerald-400 border-l-4 ring-2 ring-emerald-100 shadow-lg'
          : 'border-slate-200 border-l-4 border-l-transparent'}
      `}
    >

      <div className="flex items-start justify-between gap-4">

        <div className="space-y-1.5 flex-1 min-w-0">

          <div className="flex items-center gap-3">
            <div className="text-sm font-bold text-emerald-700 min-w-[60px]">
              {item.horario?.slice(0, 5)}
            </div>

            <div className="flex items-center gap-2 flex-wrap">

			  <StatusBadge
				status={item.status_operacional || item.status_assim || item.status}
			  />

			  {item.completion_type === 'manual_externo' && (
				<span className="
				  bg-amber-100
				  text-amber-700
				  border
				  border-amber-200
				  text-[11px]
				  px-2
				  py-0.5
				  rounded-md
				  font-medium
				">
				  Manual Externo
				</span>
			  )}

			</div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 truncate text-sm">
              {item.paciente_nome}
            </h3>

            <p className="text-[13px] text-slate-500 truncate">
              {item.classificacao_terapia || 'Sem terapia'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span>{item.profissional_nome || 'Sem terapeuta'}</span>
            <span>•</span>
            <span>{item.unidade || 'Unidade não informada'}</span>
            <span>•</span>
            <span>{item.convenio || 'Sem convênio'}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export default memo(AttendanceCard)
