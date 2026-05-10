'use client'

import {
  CheckCircle2,
  UserCheck,
  Clock3,
  Loader2,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

interface Props {
  indicadores: {
    autorizados: number
    presenca: number
    pendentes: number
    processando: number
    erros: number
    falta_terapeuta: number
  }
}

export default function KpiCards({
  indicadores,
}: Props) {
  const cards = [
    {
      title: 'Autorizados',
      value: indicadores.autorizados,
      icon: CheckCircle2,
      color: 'emerald',
    },
    {
      title: 'Presença',
      value: indicadores.presenca,
      icon: UserCheck,
      color: 'blue',
    },
    {
      title: 'Processando',
      value: indicadores.processando,
      icon: Loader2,
      color: 'amber',
      spin: true,
    },
    {
      title: 'Pendentes',
      value: indicadores.pendentes,
      icon: Clock3,
      color: 'slate',
    },
    {
      title: 'Erros',
      value: indicadores.erros,
      icon: AlertTriangle,
      color: 'red',
    },
    {
      title: 'Falta terapeuta',
      value: indicadores.falta_terapeuta,
      icon: XCircle,
      color: 'orange',
    },
  ]

  return (
    <div className="grid grid-cols-6 gap-2 bg-white/90 backdrop-blur-sm">
      {cards.map((card) => {
        const colors = getColor(card.color)

        return (
          <div
            key={card.title}
            className="
              bg-white
              backdrop-blur
              border border-slate-200
              rounded-2xl
              px-4 py-3
              shadow-sm
              hover:shadow-md
              transition-all duration-200
            "
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-slate-500 font-medium">
                  {card.title}
                </p>

                <h2 className="text-2x1 leading-none font-bold text-slate-800 mt-2">
                  {card.value}
                </h2>
              </div>

              <div
                className={`
                  w-7 h-7 rounded-2xl
                  flex items-center justify-center
                  ${colors.bg}
                `}
              >
                <card.icon
                  className={`
                    w-5 h-5
                    ${colors.text}
                    ${card.spin ? 'animate-spin' : ''}
                  `}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getColor(color: string) {
  switch (color) {
    case 'emerald':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
      }

    case 'blue':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
      }

    case 'amber':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
      }

    case 'red':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
      }

    case 'orange':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
      }

    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
      }
  }
}