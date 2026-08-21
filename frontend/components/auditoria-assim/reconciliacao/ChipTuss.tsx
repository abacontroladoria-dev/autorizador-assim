'use client'

import { memo } from 'react'
import type { PlacarTuss } from '../types'

/**
 * Uma chip do placar — e, ao mesmo tempo, o filtro daquele TUSS.
 *
 * Duas informações moram no mesmo controle, e cada uma tem seu canal:
 *
 * - o MATIZ é o estado da cota (âmbar divergente, esmeralda a conta bate). Como
 *   a chip filtra exatamente aquele estado, o matiz não decora — é o estado.
 * - o ANEL DE STEEL é a seleção. Sinal de "você está aqui" usa a marca, nunca um
 *   matiz semântico; do contrário âmbar significaria "estourou a cota" numa chip
 *   e "filtro ativo" na de baixo.
 *
 * Sem preenchimento sólido: branco sobre âmbar-500 mede 2,15:1.
 */
const ChipTuss = memo(function ChipTuss({
  item,
  ativa,
  onToggle,
}: {
  item: PlacarTuss
  ativa: boolean
  onToggle: (codigo: string | null) => void
}) {
  const estourou = item.excedente > 0
  // Faltar cobertura de sessão já ocorrida divide o mesmo eixo "a conta não
  // bate" — logo, o mesmo âmbar. O sinal de cada lado é o rótulo (+ ou −), não
  // um matiz novo, que a Status Lock Rule não admitiria.
  const divergente = estourou || item.faltante > 0
  const tom = divergente
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <button
      type="button"
      onClick={() => onToggle(ativa ? null : item.codigo_tuss)}
      aria-pressed={ativa}
      className={`flex h-11 shrink-0 items-center gap-2.5 rounded-lg border px-3 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${tom} ${
        ativa ? 'ring-2 ring-brand ring-offset-1' : ''
      }`}
      title={item.terapias || undefined}
    >
      <span className="font-mono text-xs font-semibold tabular-nums">{item.codigo_tuss}</span>
      <span className="max-w-32 truncate text-xs font-medium">{item.terapias || 'sem terapia'}</span>
      <span className="text-xs whitespace-nowrap tabular-nums">
        {item.agendadas} agend. · {item.liberadas} lib.
        {/* Cancelada aparece só quando existe: numa semana limpa ela seria um
            zero repetido em toda chip, e o placar deixaria de se ler de relance. */}
        {item.canceladas > 0 && ` · ${item.canceladas} canc.`}
      </span>
      {estourou && (
        <span
          title={`${item.excedente} liberação(ões) além do agendado`}
          className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
        >
          +{item.excedente}
        </span>
      )}
      {item.faltante > 0 && (
        <span
          title={`${item.faltante} sessão(ões) já ocorrida(s) sem liberação que a cubra`}
          className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
        >
          −{item.faltante}
        </span>
      )}
    </button>
  )
})

export default ChipTuss
