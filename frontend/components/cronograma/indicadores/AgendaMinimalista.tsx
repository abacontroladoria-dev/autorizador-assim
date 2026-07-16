import { B } from '@/lib/cronograma/constants'
import { hhmm } from '@/lib/cronograma/helpers'
import { normalizarUnidadeOcupacao } from '@/lib/cronograma/ocupacaoProf'
import { DOW_PT } from '@/lib/cronograma/ocupacaoConst'
import type { OcupacaoAgregada, SlotNormalizado } from '@/types/ocupacaoProf'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function resumoUnidadesAgenda(slots: SlotNormalizado[] | undefined): string {
  const validos = (slots ?? []).filter(s => s?.dow && s.ini !== null && s.ini !== undefined)
  const unidades = [...new Set(validos.map(s => s.unidade || 'Unidade não informada'))].sort((a, b) => a.localeCompare(b))
  if (!unidades.length) return ''
  if (unidades.length === 1) return `Sempre ${unidades[0]}`
  const partes: string[] = []
  ;[1, 2, 3, 4, 5].forEach(dow => {
    ;['Manhã', 'Tarde'].forEach(turno => {
      const us = [...new Set(
        validos.filter(s => s.dow === dow && s.turno === turno).map(s => s.unidade || 'Unidade não informada')
      )].sort((a, b) => a.localeCompare(b))
      if (us.length) partes.push(`${DOW_PT[dow]} ${turno.toLowerCase()}: ${us.join(', ')}`)
    })
  })
  return partes.join(' · ')
}

export function unidadeDiaAgenda(slots: SlotNormalizado[] | undefined, dow: number): string {
  const validos = (slots ?? []).filter(s => s?.dow === dow)
  const unidades = [...new Set(validos.map(s => normalizarUnidadeOcupacao(s.unidade)))].sort((a, b) => a.localeCompare(b))
  if (!unidades.length) return ''
  if (unidades.length === 1) return unidades[0]
  const partes: string[] = []
  ;['Manhã', 'Tarde'].forEach(turno => {
    const us = [...new Set(
      validos.filter(s => s.turno === turno).map(s => normalizarUnidadeOcupacao(s.unidade))
    )].sort((a, b) => a.localeCompare(b))
    if (us.length) partes.push(`${turno.toLowerCase()}: ${us.join(', ')}`)
  })
  return partes.join(' · ')
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

interface Props {
  ocupacao: OcupacaoAgregada | undefined | null
}

export function AgendaMinimalista({ ocupacao }: Props) {
const slots = [...(ocupacao?.slots ?? [])]
    .filter(s => s?.dow && s.ini !== null && s.ini !== undefined && s.fim !== null && s.fim !== undefined)
    .sort((a, b) => a.dow - b.dow || a.ini - b.ini || String(a.terp ?? '').localeCompare(String(b.terp ?? '')))

  if (!slots.length) return (
    <div className="rounded-xl p-3 text-xs text-muted-foreground" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      Sem agenda detalhada para exibir.
    </div>
  )

  const porDia: Record<number, SlotNormalizado[]> = {}
  const horarios: number[] = []
  slots.forEach(s => {
    if (!porDia[s.dow]) porDia[s.dow] = []
    porDia[s.dow].push(s)
    if (!horarios.includes(s.ini)) horarios.push(s.ini)
  })
  horarios.sort((a, b) => a - b)

  return (
    <div className="rounded-2xl p-4 h-full" style={{ background: 'var(--muted)', border: '1px solid var(--border)', width: '320px' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold text-xs text-foreground">Agenda livre/ocupada</div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: B.red }} />
            ocupado
          </span>
          <span>
            <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: B.green }} />
            livre
          </span>
          <span>
            <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: B.purple }} />
            ADM
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '44px repeat(5, 42px)' }}>
          <div />
          {[1, 2, 3, 4, 5].map(dow => (
            <div key={dow} className="font-bold text-center text-foreground">
              {DOW_PT[dow]}
            </div>
          ))}
          {horarios.flatMap(h => [
            <div key={`h-${h}`} className="text-[10px] text-muted-foreground py-1">{hhmm(h)}</div>,
            ...[1, 2, 3, 4, 5].map(dow => {
              const s = (porDia[dow] ?? []).find(x => x.ini === h)
              if (!s) return (
                <div key={`${dow}-${h}`} className="h-6 rounded-md bg-muted/40 border border-border" />
              )
              const ocupado      = (s.horariosOcupados ?? 0) > 0 || (s.ocupados ?? 0) > 0 || (s.ag ?? 0) > 0
              const administrativo = !!s.horarioAdministrativoEta
              const bg = administrativo ? B.purple : ocupado ? B.red : B.green
              const nPac = (s.ag ?? 0)
              const tooltip = `${hhmm(s.ini)} às ${hhmm(s.fim)} · ${s.unidade || 'Unidade não informada'} · ${administrativo ? 'Horário Administrativo' : ocupado ? `ocupado${nPac > 1 ? ` (${nPac} pac.)` : ''}` : 'livre'}`
              return (
                <div key={`${dow}-${h}`}
                  className="h-6 rounded-md text-[9px] font-bold text-white flex items-center justify-center relative"
                  title={tooltip}
                  style={{ background: bg }}>
                  {hhmm(h)}
                  {nPac > 1 && (
                    <span className="absolute -top-1 -right-1 text-[8px] font-black leading-none rounded-full flex items-center justify-center"
                      style={{ background: '#1e3a5f', color: '#fff', minWidth: 13, height: 13, paddingInline: 2 }}>
                      ×{nPac}
                    </span>
                  )}
                </div>
              )
            }),
          ])}
        </div>
      </div>
    </div>
  )
}
