'use client'

export default function MachineStatusBadge({ status }: { status: string }) {
  const style =
    status === 'online'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'offline'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-slate-100 text-slate-600'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Indefinido'}
    </span>
  )
}
