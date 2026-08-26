import { B } from '@/lib/cronograma/constants'
import { fmtH, fmtHDec, fmtPctOcup } from '@/lib/cronograma/helpers'
import type { OcupacaoAgregada } from '@/types/ocupacaoProf'
import { InteractivePieChart } from './InteractivePieChart'

interface Props {
  item: { ocupacao: OcupacaoAgregada } | null | undefined
  size?: number
  /** Repassado ao disco central do donut (útil quando embutido em card tintado). */
  centerFillClassName?: string
  /** Repassado ao contorno entre os segmentos — deve casar com o mesmo fundo de `centerFillClassName`. */
  ringStrokeClassName?: string
}

export function OcupacaoDonut({ item, size = 150, centerFillClassName, ringStrokeClassName }: Props) {
  const oc = item?.ocupacao
  if (!oc) return null

  const totalHoras   = oc.horasTotal    || 0
  const ocupadoTotal = oc.horasOcupadas || 0
  const livre        = oc.horasLivres   || 0
  const admin        = oc.horasTecnicas || 0
  const comPaciente  = Math.max(ocupadoTotal - admin, 0)
  const temAdmin     = admin > 0.0001
  const pctTempo     = totalHoras > 0 ? ocupadoTotal / totalHoras : null

  const segments = temAdmin
    ? [
        { value: comPaciente,  color: B.red,    label: 'Com paciente' },
        { value: admin,        color: B.purple, label: 'Horário Administrativo' },
        { value: livre,        color: B.green,  label: 'Livre' },
      ]
    : [
        { value: ocupadoTotal, color: B.red,   label: 'Ocupada' },
        { value: livre,        color: B.green, label: 'Livre' },
      ]

  return (
    <div className="flex flex-col items-center justify-center">
      <InteractivePieChart
        size={size}
        title="Carga semanal"
        centerFillClassName={centerFillClassName}
        ringStrokeClassName={ringStrokeClassName}
        centerLabel={fmtPctOcup(pctTempo)}
        valueFormatter={(v, seg) =>
          seg?.label === 'Horário Administrativo' ? fmtHDec(v) : fmtH(v)
        }
        segments={segments.filter(s => (s.value || 0) > 0)}
      />
      <div className="mt-1 text-center text-[11px] leading-snug text-muted-foreground">
        <strong className="text-foreground">CH total:</strong> {fmtH(totalHoras)}
      </div>
    </div>
  )
}
