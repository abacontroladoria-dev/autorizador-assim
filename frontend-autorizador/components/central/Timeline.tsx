'use client'

import {
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Loader2,
  XCircle,
} from 'lucide-react'

interface Props {
  logs: any[]
}

export default function Timeline({
  logs,
}: Props) {

  if (!logs?.length) {

    return (

      <div className="
        text-sm
        text-slate-400
      ">
        Nenhum evento operacional.
      </div>

    )
  }

  // ========================================
  // ORDENA LOGS
  // ========================================

  const logsOrdenados = [...logs].sort(

    (a, b) =>

      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()

  )

  // ========================================
  // REMOVE DUPLICADOS CONSECUTIVOS
  // ========================================

  const logsFiltrados =
    logsOrdenados.filter(
      (log, index, arr) => {

        const anterior = arr[index - 1]

        return !(

          anterior &&

          anterior.descricao === log.descricao &&

          anterior.status === log.status

        )
      }
    )

  const ultimoLog =
    logsFiltrados[
      logsFiltrados.length - 1
    ]

  return (

    <div className="space-y-4">

      {logsFiltrados.map((log, index) => {

        const isAtual =
          ultimoLog?.id === log.id

        const config =
          getConfig(
            log.status,
            isAtual
          )

        const dataExibicao =

          log.status === 'concluido' &&
          log.horario_autorizacao

            ? log.horario_autorizacao

            : log.created_at

        return (

          <div
            key={log.id || index}
            className="
              flex gap-3
            "
          >

            {/* ÍCONE */}
            <div className={`
              mt-0.5
              w-8 h-8
              rounded-full
              flex items-center justify-center
              border
              shrink-0
              ${config.className}
            `}>

              <config.icon
                className={`
                  w-4 h-4
                  ${config.animate
                    ? 'animate-spin'
                    : ''
                  }
                `}
              />

            </div>

            {/* LINHA */}
            <div className="flex-1 pb-4 relative">

              {index !== logs.length - 1 && (

                <div className="
                  absolute
                  left-[-28px]
                  top-8
                  w-px
                  h-full
                  bg-slate-200
                " />

              )}

              <p className="
                text-sm
                font-medium
                text-slate-700
              ">
                {log.descricao}
              </p>

              <div className="
                flex items-center gap-2
                mt-1 flex-wrap
              ">

                <span className="
                  text-xs
                  text-slate-400
                ">

                  {log.status === 'concluido' &&
                   log.horario_autorizacao
                    ? `ASSIM • ${new Date(
                        dataExibicao
                      ).toLocaleTimeString(
                        'pt-BR',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}`
                    : new Date(
                        dataExibicao
                      ).toLocaleTimeString(
                        'pt-BR',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}

                </span>

              </div>

              {log.erro && (

                <div className="
                  mt-2
                  text-xs
                  text-red-600
                  bg-red-50
                  border border-red-100
                  rounded-lg
                  px-2 py-1
                ">
                  {log.erro}
                </div>

              )}

            </div>

          </div>

        )
      })}

    </div>
  )
}

function getConfig(
  status?: string,
  isAtual?: boolean
) {

  switch (status) {

    case 'concluido':
      return {
        icon: CheckCircle2,
        className:
          'bg-emerald-50 text-emerald-600 border-emerald-200',
      }

    case 'processando':
      return {
        icon: Loader2,
        className:
          'bg-blue-50 text-blue-600 border-blue-200',
        animate: isAtual,
      }

    case 'erro':
      return {
        icon: AlertTriangle,
        className:
          'bg-red-50 text-red-600 border-red-200',
      }

    case 'falta':
      return {
        icon: XCircle,
        className:
          'bg-orange-50 text-orange-600 border-orange-200',
      }

    default:
      return {
        icon: Clock3,
        className:
          'bg-slate-100 text-slate-500 border-slate-200',
      }
  }
}