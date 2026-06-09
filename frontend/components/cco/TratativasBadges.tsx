'use client'

import { RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react'

interface Props {
  substituicao?: { original: string; substituto: string }
  glosa?: boolean
  tratativas?: string[]
}

export default function TratativasBadges({ substituicao, glosa, tratativas }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {substituicao && (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          <RefreshCw size={12} />
          Subst. {substituicao.original.split(' ')[0]} → {substituicao.substituto.split(' ')[0]}
        </span>
      )}
      {glosa && (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
          <AlertCircle size={12} />
          Glosa
        </span>
      )}
      {tratativas && tratativas.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle size={12} />
          {tratativas.length} tratativa{tratativas.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
