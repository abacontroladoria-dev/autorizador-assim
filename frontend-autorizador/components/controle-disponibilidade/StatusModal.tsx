'use client'

import { X } from 'lucide-react'

import HorarioCheckboxList from './HorarioCheckboxList'

import { useEffect } from 'react'

type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'
  | 'substituido'

type HorarioEdicao = {
  id: number
  horario: string
  paciente: string
  statusAtual?: string | null
  selecionado: boolean
}

type Grupo = {
  terapeuta: string
  status: string
  atendimentos: any[]
}

type Props = {
  data: string

  modalStatus: Grupo | null

  horariosEdicao: HorarioEdicao[]

  novoStatusModal: StatusDisponibilidade

  salvandoStatus: boolean

  erroStatus: string | null

  toggleHorario: (
    id: number,
    checked: boolean
  ) => void

  atualizarStatusSelecionado: (
    grupo: Grupo,
    status: StatusDisponibilidade
  ) => void

  setModalStatus: (
    grupo: null
  ) => void
}

export default function StatusModal({
  data,
  modalStatus,
  horariosEdicao,
  novoStatusModal,
  salvandoStatus,
  erroStatus,
  toggleHorario,
  atualizarStatusSelecionado,
  setModalStatus,
}: Props) {

useEffect(() => {

  if (modalStatus) {
    document.body.style.overflow = 'hidden'
  }

  return () => {
    document.body.style.overflow = 'auto'
  }

}, [modalStatus])

  if (!modalStatus) {
    return null
  }

  return (
    <div
		  onClick={() =>
			setModalStatus(null)
		  }
		  className="
			fixed inset-0 z-50
			bg-black/40

			flex items-end
			md:items-center
			md:justify-center

			p-0
			md:p-6
		  "
		>

		<div
		  onClick={(e) =>
			e.stopPropagation()
		  }
		  className="
			bg-white
			w-full
			md:w-[720px]

			rounded-t-3xl
			md:rounded-3xl

			p-4

			max-h-[85vh]
			overflow-auto

			shadow-2xl
		  "
		>

        <div className="flex items-center justify-between">

          <div>
            <h3 className="font-bold text-slate-800">
              Selecione os horários de alteração
            </h3>

			<div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#eef5fb] border border-[#d7e8f3]">

			  <div className="rounded-full bg-[#3A8FB7]" />

			  <p className="text-sm font-semibold text-[#256589]">
				{modalStatus.terapeuta}
			  </p>

			</div>
          </div>

          <button
            onClick={() =>
              setModalStatus(null)
            }
          >
            <X className="h-5 w-5" />
          </button>

        </div>

        {horariosEdicao.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const todosM = horariosEdicao.every((h) => h.selecionado)
                horariosEdicao.forEach((h) => toggleHorario(h.id, !todosM))
              }}
              className="text-xs text-[#3A8FB7] font-semibold hover:underline"
            >
              {horariosEdicao.every((h) => h.selecionado) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>
        )}

        <HorarioCheckboxList
          data={data}
          horariosEdicao={horariosEdicao}
          toggleHorario={toggleHorario}
        />

        {erroStatus && (
          <p className="mt-3 text-sm text-red-600 text-center">
            {erroStatus}
          </p>
        )}

        <button
          disabled={salvandoStatus}
          onClick={() =>
            atualizarStatusSelecionado(
              modalStatus,
              novoStatusModal
            )
          }
          className={`
            w-full
            mt-5
            h-12
            rounded-2xl
            text-white
            font-semibold
            ${
              novoStatusModal === 'disponivel'
                ? 'bg-green-600'
                : 'bg-red-600'
            }
          `}
        >

          {novoStatusModal === 'disponivel'
            ? 'Confirmar disponibilidade'
            : 'Confirmar indisponibilidade'}

        </button>

      </div>

    </div>
  )
}