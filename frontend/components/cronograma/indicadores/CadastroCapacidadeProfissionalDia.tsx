'use client'

// Cadastro de quantidade esperada de pacientes — generaliza a exceção que
// antes só existia hardcoded pra Musicoterapia (MUSICO_CAPAC_POR_DIA em
// ocupacaoProf.ts): agora qualquer profissional pode ter, por dia da
// semana, uma capacidade diferente do padrão (1 paciente por horário). O
// valor editado aqui é a mesma fonte que `calcularOcupacaoSemanal` usa
// (getSlotCap) — editar uma célula readapta o cálculo de ocupação na hora.

import { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { normTxt } from '@/lib/cronograma/constants'
import { capacidadeEsperadaProfissionalDia, type CapacidadeOverrides } from '@/lib/cronograma/ocupacaoProf'
import { DOW_PT } from '@/lib/cronograma/ocupacaoConst'
import type { DadosProfissional } from '@/types/ocupacaoProf'

const DIAS = [1, 2, 3, 4, 5] as const

interface CadastroCapacidadeProfissionalDiaProps {
  dadosPorProf: DadosProfissional[]
  capacidadeOverrides: CapacidadeOverrides
  onSalvar: (profissionalNome: string, dow: number, capacidade: number) => Promise<void>
}

interface LinhaCadastro {
  prof: string
  especialidade: string
  porDia: Record<number, { trabalha: boolean; valor: number }>
  temExcecao: boolean
}

export function CadastroCapacidadeProfissionalDia({ dadosPorProf, capacidadeOverrides, onSalvar }: CadastroCapacidadeProfissionalDiaProps) {
  const [busca, setBusca] = useState('')
  const [soComExcecao, setSoComExcecao] = useState(true)
  const [celulaSalvando, setCelulaSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const linhas = useMemo((): LinhaCadastro[] => {
    return dadosPorProf.map(d => {
      // `slotData.diasInfo` só tem entrada pro dow quando existiu ALGUMA linha
      // real (livre ou agendada) da agenda naquele dia — ver buildAllSlotsFromRows
      // (useOcupacaoProf.ts). É a mesma fonte que já alimenta o resto da tela;
      // reaproveitada aqui pra travar edição em dia sem agenda real.
      const diasTrabalhados = new Set(Object.keys(d.slotData?.diasInfo ?? {}).map(Number))
      const porDia: LinhaCadastro['porDia'] = {}
      let temExcecao = false
      DIAS.forEach(dow => {
        const trabalha = diasTrabalhados.has(dow)
        const valor = capacidadeEsperadaProfissionalDia(d.prof, dow, capacidadeOverrides)
        porDia[dow] = { trabalha, valor }
        if (trabalha && valor > 1) temExcecao = true
      })
      const especialidade = d.terapiaDetails.map(t => t.terp).join(' · ')
      return { prof: d.prof, especialidade, porDia, temExcecao }
    }).sort((a, b) => a.prof.localeCompare(b.prof, 'pt-BR'))
  }, [dadosPorProf, capacidadeOverrides])

  const linhasFiltradas = useMemo(() => {
    const q = normTxt(busca)
    return linhas.filter(l => (!soComExcecao || l.temExcecao) && (!q || normTxt(l.prof).includes(q)))
  }, [linhas, busca, soComExcecao])

  async function handleSalvar(prof: string, dow: number, valor: number) {
    const key = `${prof}|${dow}`
    setCelulaSalvando(key)
    setErro(null)
    try {
      await onSalvar(prof, dow, valor)
    } catch (e) {
      setErro(`Erro ao salvar ${prof} · ${DOW_PT[dow]}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCelulaSalvando(prev => (prev === key ? null : prev))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="text-[11px] text-muted-foreground">
          Padrão: 1 paciente por horário, todos os dias. Dias sem agenda real (livre ou agendado) ficam bloqueados.
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar profissional..."
              className="w-[190px] rounded-lg border border-border bg-background pl-7 pr-2.5 py-1.5 text-xs text-foreground"
            />
          </label>
          <label className="flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={soComExcecao} onChange={e => setSoComExcecao(e.target.checked)} className="rounded border-border" />
            Só valor {'>'} 1
          </label>
        </div>
      </div>

      {erro && <div className="pb-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{erro}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted-foreground text-[11px] border-b border-border">
              <th className="text-left px-2 pb-2 font-medium">Profissional</th>
              <th className="text-left px-2 pb-2 font-medium">Especialidade</th>
              {DIAS.map(dow => (
                <th key={dow} className="w-16 text-center px-2 pb-2 font-medium">{DOW_PT[dow]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map(l => (
              <tr key={l.prof} className="border-b border-border/60 last:border-0">
                <td className="max-w-[220px] truncate px-2 py-1.5 font-medium text-foreground" title={l.prof}>{l.prof}</td>
                <td className="max-w-[200px] truncate px-2 py-1.5 text-muted-foreground" title={l.especialidade}>{l.especialidade || '—'}</td>
                {DIAS.map(dow => {
                  const info = l.porDia[dow]
                  const key = `${l.prof}|${dow}`
                  const salvando = celulaSalvando === key

                  if (!info.trabalha) {
                    return (
                      <td key={dow} className="px-2 py-1.5 text-center">
                        <span
                          title="Sem agenda real (livre ou agendado) neste dia — não é possível editar."
                          className="inline-flex h-7 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground/50"
                        >
                          —
                        </span>
                      </td>
                    )
                  }

                  return (
                    <td key={dow} className="px-2 py-1.5 text-center">
                      <span className="relative inline-flex items-center">
                        <input
                          // Remonta (perde edição não-commitada) quando o valor
                          // resolvido muda por fora — ex.: outra aba/usuário
                          // salvou. Único jeito de um input não-controlado
                          // acompanhar uma mudança externa sem re-render a cada
                          // tecla digitada.
                          key={`${key}-${info.valor}`}
                          type="number"
                          min={1}
                          max={20}
                          defaultValue={info.valor}
                          disabled={salvando}
                          onBlur={e => {
                            const novo = Math.max(1, Math.round(Number(e.target.value) || 1))
                            e.target.value = String(novo)
                            if (novo !== info.valor) handleSalvar(l.prof, dow, novo)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className={`h-7 w-12 rounded-md border text-center text-xs disabled:opacity-50 ${
                            info.valor > 1
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-border bg-background text-foreground'
                          }`}
                        />
                        {salvando && <Loader2 size={11} className="ml-1 shrink-0 animate-spin text-muted-foreground" />}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
            {!linhasFiltradas.length && (
              <tr>
                <td colSpan={DIAS.length + 2} className="px-2 py-4 text-center text-muted-foreground">
                  Nenhum profissional encontrado{soComExcecao ? ' com valor acima de 1' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
