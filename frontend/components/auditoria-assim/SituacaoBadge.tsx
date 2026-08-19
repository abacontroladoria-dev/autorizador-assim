type SituacaoConfigEntry = { label: string; dot: string; className: string }

export const SITUACAO_CONFIG: Record<string, SituacaoConfigEntry> = {
  NAO_SOLICITADA: {
    label: 'Não Solicitada',
    dot: 'bg-red-600',
    className: 'bg-red-50 text-red-600 ring-1 ring-red-300',
  },
  SINCRONIZANDO: {
    label: 'Sincronizando',
    dot: 'bg-blue-600',
    className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-300',
  },
  RETORNO_NAO_CONFIRMADO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-orange-600',
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-300',
  },
  // alias legado — removível após migration aplicada
  AGUARDANDO_RETORNO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-orange-600',
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-300',
  },
  LIBERADA: {
    label: 'Liberada',
    dot: 'bg-green-600',
    className: 'bg-green-50 text-green-600 ring-1 ring-green-300',
  },
  GLOSA: {
    label: 'Glosa',
    dot: 'bg-violet-600',
    className: 'bg-violet-50 text-violet-600 ring-1 ring-violet-300',
  },
  CANCELADA: {
    label: 'Cancelada',
    dot: 'bg-gray-500',
    className: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300',
  },
  FALTA: {
    label: 'Falta',
    dot: 'bg-yellow-500',
    className: 'bg-yellow-50 text-yellow-600 ring-1 ring-yellow-300',
  },
  FALTA_TERAPEUTA: {
    label: 'Falta Terapeuta',
    dot: 'bg-red-500',
    className: 'bg-red-50 text-red-600 ring-1 ring-red-300',
  },
}

export default function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-slate-400">—</span>

  const config: SituacaoConfigEntry = SITUACAO_CONFIG[situacao] ?? {
    label: situacao,
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-300',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  )
}
