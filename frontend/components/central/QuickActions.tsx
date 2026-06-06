'use client'

import {
  UserCheck,
  UserX,
  RotateCcw,
  CalendarClock,
  MessageCircle,
} from 'lucide-react'

export default function QuickActions({
  atendimento,
}: any) {
  return (
    <div className="grid grid-cols-2 gap-3">

      <ActionButton
        icon={UserCheck}
        label="Confirmar presença"
        color="emerald"
        onClick={() => {
          console.log('confirmar presença', atendimento)
        }}
      />

      <ActionButton
        icon={UserX}
        label="Falta terapeuta"
        color="red"
        onClick={() => {
          console.log('falta terapeuta', atendimento)
        }}
      />

      <ActionButton
        icon={RotateCcw}
        label="Reenviar"
        color="amber"
        onClick={() => {
          console.log('reenviar', atendimento)
        }}
      />

      <ActionButton
        icon={CalendarClock}
        label="Remarcar"
        color="blue"
        onClick={() => {
          console.log('remarcar', atendimento)
        }}
      />

      <div className="col-span-2">
        <ActionButton
          icon={MessageCircle}
          label="Abrir WhatsApp"
          color="violet"
          full
          onClick={() => {
            console.log('whatsapp', atendimento)
          }}
        />
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  color,
  full,
  onClick,
}: any) {
  const styles = getColor(color)

  return (
    <button
      onClick={onClick}
      className={`
        h-12
        rounded-2xl
        flex items-center justify-center gap-2
        text-sm font-medium
        transition-all
        hover:scale-[1.01]
        active:scale-[0.99]
        shadow-sm
        ${full ? 'w-full' : ''}
        ${styles}
      `}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function getColor(color: string) {
  switch (color) {
    case 'emerald':
      return 'bg-emerald-600 hover:bg-emerald-700 text-white'

    case 'red':
      return 'bg-red-600 hover:bg-red-700 text-white'

    case 'amber':
      return 'bg-amber-500 hover:bg-amber-600 text-white'

    case 'blue':
      return 'bg-blue-600 hover:bg-blue-700 text-white'

    case 'violet':
      return 'bg-violet-600 hover:bg-violet-700 text-white'

    default:
      return 'bg-slate-600 hover:bg-slate-700 text-white'
  }
}