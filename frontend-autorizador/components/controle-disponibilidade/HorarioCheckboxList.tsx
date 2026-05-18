'use client'

type HorarioEdicao = {
  id: number
  horario: string
  paciente: string
  statusAtual?: string | null
  selecionado: boolean
}

type Props = {
  data: string
  horariosEdicao: HorarioEdicao[]
  toggleHorario: (
    id: number,
    checked: boolean
  ) => void
}

export default function HorarioCheckboxList({
  data,
  horariosEdicao,
  toggleHorario,
}: Props) {

  return (
    <div className="mt-4 space-y-2">

      {horariosEdicao.map((horario) => {

        const retroativo =
          new Date(
            `${data}T${horario.horario.slice}`
          ) < new Date()

        return (

          <label
            key={horario.id}
            className="
              flex items-center gap-3
              border border-slate-200
              rounded-2xl
              px-4 py-3
            "
          >

            <input
              type="checkbox"
              checked={horario.selecionado}
              onChange={(e) =>
                toggleHorario(
                  horario.id,
                  e.target.checked
                )
              }
              className="h-5 w-5"
            />

            <div className="flex-1 min-w-0">

              <div className="flex items-center gap-2">

                <span className="font-semibold text-sm text-slate-800">
                  {horario.horario.slice(0, 5)}
                </span>

                {retroativo && (
                  <span className="
                    text-[10px]
                    px-2 py-1
                    rounded-full
                    bg-amber-100
                    text-amber-700
                    font-semibold
                  ">
                    Retroativo
                  </span>
                )}

              </div>

              <div className="text-xs text-slate-500 truncate mt-1">
                {horario.paciente}
              </div>

              <div className="text-[11px] text-slate-400 mt-1">
                Status atual:
                {' '}
                {horario.statusAtual || 'pendente'}
              </div>

            </div>

          </label>

        )
      })}

    </div>
  )
}