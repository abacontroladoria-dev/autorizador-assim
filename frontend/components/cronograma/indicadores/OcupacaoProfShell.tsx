'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useHeader } from '@/contexts/HeaderContext'
import {
  ChevronDown, ChevronRight, Search, SlidersHorizontal, Download, X, Building2,
  LayoutDashboard, Table2, ClipboardEdit, Eye, EyeOff,
} from 'lucide-react'
import { iconeTerapia } from '@/lib/cronograma/iconeTerapia'
import { StatCard } from '@/components/cronograma/ui/StatCard'
import { SegmentedTabs } from '@/components/cronograma/ui/SegmentedTabs'
import { TONE_ACCENT, type Tone } from '@/components/cronograma/ui/tones'
import { SortableTh, ordenarPor, type SortDir } from '@/components/cronograma/ui/SortableTh'
import { B, normTxt } from '@/lib/cronograma/constants'
import { fmtH, fmtHDec, fmtPctOcup } from '@/lib/cronograma/helpers'
import {
  agregarOcupacaoDeSlots,
  corFaixaOcupacao,
  dentroFaixaOcupacao,
  filtrarOcupacaoPorUnidade,
  finalizarBaseOcup,
  novaBaseOcup,
  normalizarUnidadeOcupacao,
  regrasCapacidadeTexto,
  somaBaseOcup,
  temBaseOcupacaoLinha,
  temComparecimentoNoTurno,
  textoFaixaOcupacao,
} from '@/lib/cronograma/ocupacaoProf'
import { DOW_PT, OCUP_COMPARE_SLOTS, OCUP_FAIXAS, OCUP_SORTS } from '@/lib/cronograma/ocupacaoConst'
import { useOcupacaoProf } from '@/hooks/useOcupacaoProf'
import { getRefWeek } from '@/lib/cronograma/helpers'
import { AgendaMinimalista, resumoUnidadesAgenda, unidadeDiaAgenda, unidadeDiaTurnoAgenda } from './AgendaMinimalista'
import { OcupacaoDonut } from './OcupacaoDonut'
import { FiltroCheckbox, FiltroRadio, PercentualOcupacao } from './OcupacaoAtomicos'
import { CadastroCapacidadeProfissionalDia } from './CadastroCapacidadeProfissionalDia'
import type { BaseOcup, OcupacaoAgregada, OcupacaoFinalizada, SlotNormalizado } from '@/types/ocupacaoProf'

// ─── CONSTANTES LOCAIS ────────────────────────────────────────────────────────

/** "Segunda - Manhã" etc. na tabela "Ocupação por dia e turno" — sem o "-feira" que DOW_PT_LONG (ocupacaoProf.ts) usa. */
const DOW_LABEL: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' }

const UNIDADES_DASHBOARD = ['Realengo', 'Fazendinha', 'Padre Miguel', 'Ambiente Natural']
const UNIDADE_CORRIGIR   = 'Consertar Unidade no sistema'

// Cores de terapia (paleta da clínica, conforme tabela oficial)
// Entradas #FFFFFF = sem cor definida → usa corFaixaOcupacao como fallback
const TERAPIA_CORES: Record<string, string> = {
  'Aplicador ABA (AE)':                '#E89D9D',
  'Aplicador ABA (AV)':                '#FFFFFF',
  'Aplicador ABA (EF)':                '#57E6D6',
  'Aplicador ABA (HS)':                '#FFFFFF',
  'Aplicador ABA (PS)':                '#D4A9F5',
  'Aplicador ABA (SF)':                '#BDB8BF',
  'Aplicador ABA Casa':                '#BDB8BF',
  'Aplicador ABA Escola':              '#A9A2A2',
  'Aplicador Suporte':                 '#E9FECE',
  'Aplicador Suporte (MT)':            '#FFFFFF',
  'Aplicador Suporte (TA)':            '#FFFFFF',
  'Aplicador Suporte (TO)':            '#FFFFFF',
  'Apoio Operacional':                 '#FFFFFF',
  'Arteterapia':                       '#E89D9D',
  'Arteterapia (Psicologia ABA)':      '#FFAD98',
  'Assistente de Desenvolvimento':     '#FFFFFF',
  'Avaliação Neuropsicológica':        '#FFFFFF',
  'Circuito Funcional':                '#FFFFFF',
  'Coordenador de Caso':               '#A560E5',
  'Cozinha Funcional':                 '#FFFFFF',
  'Equoterapia':                       '#946D05',
  'Especialista Técnico de Área':      '#FFFFFF',
  'Esporte Adaptado':                  '#FFFFFF',
  'Estágio':                           '#FFFFFF',
  'Facilitador Técnico':               '#FFFFFF',
  'Fisioterapia':                      '#54E8E3',
  'Fisioterapia Aquática':             '#9DD0FD',
  'Fonoaudiologia':                    '#E0B00F',
  'Habilidades Sociais (Psicologia ABA)': '#6B5D5D',
  'Musicalização':                     '#FFFFFF',
  'Musicoterapia':                     '#FFAD98',
  'Nutrição':                          '#BCF47C',
  'OFERECER CONSULTA NUTRIÇÃO':        '#54A9FA',
  'Oficina de Aprendizagem':           '#FFFFFF',
  'Operações Clínicas':                '#FFFFFF',
  'Psicoeducação':                     '#E996F1',
  'Psicologia':                        '#C81ED5',
  'Psicologia ABA':                    '#FFFFFF',
  'Psicomotricidade':                  '#39A8F9',
  'Psicopedagogia':                    '#FFFB73',
  'Supervisão ABA':                    '#000000',
  'Técnico Terapêutico Particular':    '#FFFFFF',
  'Terapia Alimentar':                 '#95EF9C',
  'Terapia Ocupacional':               '#0B13CA',
  'Triagem':                           '#EE8F00',
  'Trilha Socioemocional':             '#FFFFFF',
  'Visita Guiada':                     '#EC62E5',
}
function corTerapiaEsp(esp: string, fallback: string): string {
  const c = TERAPIA_CORES[esp]
  if (!c || c.toUpperCase() === '#FFFFFF') return fallback
  return c
}

// Badge que identifica o tipo de seção (dashboard de cards vs. tabela vs.
// cadastro editável) — substitui repetir "Ocupação de Profissionais -
// Dashboard/Tabela/Cadastro por..." em cada título.
function TipoSecaoBadge({ tipo }: { tipo: 'dashboard' | 'tabela' | 'cadastro' }) {
  const Icon = tipo === 'dashboard' ? LayoutDashboard : tipo === 'cadastro' ? ClipboardEdit : Table2
  const label = tipo === 'dashboard' ? 'Dashboard' : tipo === 'cadastro' ? 'Cadastro' : 'Tabela'
  const cor = tipo === 'dashboard'
    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    : tipo === 'cadastro'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cor}`}>
      <Icon size={11} />
      {label}
    </span>
  )
}

// ─── HELPERS DE VIEW ─────────────────────────────────────────────────────────

function terapiaContemFiltro(terapia: string, filtro: string): boolean {
  const t = normTxt(terapia), f = normTxt(filtro)
  if (!t || !f) return false
  return t === f || t.includes(f) || f.includes(t)
}

function visaoProfissional(base: OcupacaoFinalizada): { pct: number | null; texto: string } {
  const total    = base?.horariosTotal    ?? 0
  const ocupados = base?.horariosOcupados ?? 0
  const pct      = total > 0 ? ocupados / total : null
  return {
    pct,
    texto: total > 0
      ? `${ocupados} de ${total} horários dos profissionais ocupados = ${fmtPctOcup(pct)}`
      : 'Sem horários de profissionais na base filtrada',
  }
}

type DashEspItem = OcupacaoFinalizada & {
  especialidade: string
  profissional: ReturnType<typeof visaoProfissional>
  profissionaisQtd: number
  profissionaisNomes: string[]
}

function dashboardPorEspecialidade(
  lista: { prof: string; ocupacao: OcupacaoAgregada | null }[],
  espFiltro: string[],
): DashEspItem[] {
  const filtro = espFiltro.filter(x => x && x !== '__none__')
  const mapa: Record<string, { especialidade: string; slots: SlotNormalizado[]; profissionais: Set<string> }> = {}
  lista.forEach(d => {
    ;(d.ocupacao?.slots ?? []).forEach(s => {
      const esp = s.terp || 'Sem especialidade'
      if (filtro.length && !filtro.some(f => terapiaContemFiltro(esp, f))) return
      if (!mapa[esp]) mapa[esp] = { especialidade: esp, slots: [], profissionais: new Set() }
      mapa[esp].slots.push(s)
      mapa[esp].profissionais.add(d.prof)
    })
  })
  return Object.values(mapa).map(g => {
    const base = agregarOcupacaoDeSlots(g.slots)
    return {
      ...base,
      especialidade: g.especialidade,
      profissional: visaoProfissional(base),
      profissionaisQtd: g.profissionais.size,
      profissionaisNomes: [...g.profissionais].sort((a, b) => a.localeCompare(b)),
    }
  }).sort((a, b) => ((b.pct ?? -1) - (a.pct ?? -1)) || a.especialidade.localeCompare(b.especialidade))
}

// ─── TABELA RESUMO (fora do componente para evitar remount) ──────────────────

type LinhaResumo = {
  label: string; pct: number | null; baseCompacta: string; baseTexto: string
  horasOcupadas: number; horasLivres: number
  capacidadeMultipla: boolean
  horariosOcupados: number; horariosTotal: number
  slotsOcupados: number; slotsTotal: number
  /** Ordem natural do recorte (ex.: dia/turno em sequência cronológica) — usada só como sort padrão inicial. */
  ordem?: number
}

type SortKeyResumo = keyof LinhaResumo | 'pctDasOcupadas' | 'pctDoTotal' | 'horariosLivres'

/** Deriva a tonalidade padrão do sistema (StatCard) a partir do % de ocupação — mesmos limiares de corFaixaOcupacao. */
function toneOcupacao(pct: number | null | undefined): Tone {
  if (pct === null || pct === undefined) return 'slate'
  const p = Number(pct) > 1 ? Number(pct) / 100 : Number(pct)
  if (!Number.isFinite(p)) return 'slate'
  if (p >= 0.8) return 'green'
  if (p >= 0.6) return 'blue'
  if (p >= 0.4) return 'amber'
  return 'red'
}

function TabelaResumo({ linhas, sortPadrao = { key: 'label', dir: 'asc' }, recorteSortKey = 'label' }: {
  linhas: LinhaResumo[]
  sortPadrao?: { key: SortKeyResumo; dir: SortDir }
  /** Chave usada ao clicar no cabeçalho "Recorte" — 'label' ordena alfabeticamente, 'ordem' respeita a sequência natural (ex.: dia/turno cronológico). */
  recorteSortKey?: SortKeyResumo
}) {
  const temCapacidadeMultipla = linhas.some(x => x.capacidadeMultipla)
  const totalOcupadas = linhas.reduce((s, x) => s + (x.horariosOcupados || 0), 0)
  const totalSessoes  = linhas.reduce((s, x) => s + (x.horariosTotal || 0), 0)

  const linhasCalc = useMemo(() => linhas.map(x => ({
    ...x,
    horariosLivres: x.horariosTotal - x.horariosOcupados,
    pctDasOcupadas: totalOcupadas > 0 ? x.horariosOcupados / totalOcupadas : null,
    pctDoTotal:     totalSessoes  > 0 ? x.horariosTotal  / totalSessoes  : null,
  })), [linhas, totalOcupadas, totalSessoes])

  const [sort, setSort] = useState<{ key: SortKeyResumo; dir: SortDir }>(sortPadrao)
  const linhasOrdenadas = useMemo(
    () => ordenarPor(linhasCalc, sort.key as keyof (typeof linhasCalc)[number], sort.dir),
    [linhasCalc, sort.key, sort.dir],
  )

  function onSortClick(key: string) {
    setSort(prev => ({ key: key as SortKeyResumo, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <SortableTh label="Recorte" sortKey={recorteSortKey} activeKey={sort.key} dir={sort.dir} onClick={onSortClick}
              info="Nome da especialidade/terapia, unidade ou dia × turno, dependendo da tabela." />
            <SortableTh label="Sessões ocupadas" sortKey="horariosOcupados" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Quantidade de sessões preenchidas nesse recorte." />
            <SortableTh label="Sessões livres" sortKey="horariosLivres" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Quantidade de horários vagos nesse recorte." />
            <SortableTh label="Sessões total" sortKey="horariosTotal" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Soma de sessões ocupadas + livres nesse recorte." />
            {temCapacidadeMultipla && (
              <SortableTh label="Vagas simult." sortKey="slotsOcupados" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
                info="Quando o recorte admite mais de um paciente por horário (ex.: Musicoterapia), vagas ocupadas sobre o total de vagas simultâneas." />
            )}
            <SortableTh label="% das ocupadas" sortKey="pctDasOcupadas" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Percentual que as sessões ocupadas deste recorte representam sobre o total de sessões OCUPADAS da Clínica." />
            <SortableTh label="% do total" sortKey="pctDoTotal" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Percentual que o total de sessões (quer sejam OCUPADAS ou LIVRES) deste recorte representa sobre o TOTAL GERAL, quer OCUPADAS ou LIVRES de sessões." />
            <SortableTh label="CH ocupada" sortKey="horasOcupadas" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Carga horária ocupada nesse recorte, em horas." />
            <SortableTh label="CH livre" sortKey="horasLivres" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Carga horária livre nesse recorte, em horas." />
            <SortableTh label="% ocup." sortKey="pct" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick}
              info="Percentual de ocupação desse recorte (sessões ocupadas / sessões total)." />
          </tr>
        </thead>
        <tbody>
          {linhasOrdenadas.map(x => (
            <tr key={x.label} className="border-t border-border/40">
              <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{x.label}</td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground" title={x.baseTexto}>
                {x.slotsTotal > 0 ? Math.round(x.horariosOcupados) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground" title={x.baseTexto}>
                {x.slotsTotal > 0 ? Math.round(x.horariosLivres) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground" title={x.baseTexto}>
                {x.slotsTotal > 0 ? Math.round(x.horariosTotal) : '—'}
              </td>
              {temCapacidadeMultipla && (
                <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                  {x.capacidadeMultipla ? `${Math.round(x.slotsOcupados)}/${Math.round(x.slotsTotal)}` : '—'}
                </td>
              )}
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                {x.pctDasOcupadas !== null ? fmtPctOcup(x.pctDasOcupadas) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                {x.pctDoTotal !== null ? fmtPctOcup(x.pctDoTotal) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">{fmtH(x.horasOcupadas)}</td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">{fmtH(x.horasLivres)}</td>
              <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                <PercentualOcupacao pct={x.pct} />
              </td>
            </tr>
          ))}
          {!linhasOrdenadas.length && (
            <tr>
              <td colSpan={temCapacidadeMultipla ? 10 : 9} className="py-4 text-center text-muted-foreground">Sem dados nos filtros atuais.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── SHELL PRINCIPAL ─────────────────────────────────────────────────────────

export function OcupacaoProfShell() {
  const refWeek = getRefWeek()
  const {
    dadosPorProf, allTerps, allUnits, analMes, loading, error,
    capacidadeOverrides, salvarCapacidadeProfissionalDia,
  } = useOcupacaoProf(refWeek.inicio, refWeek.fim, refWeek.label)

  const { setHeader, setRightContent } = useHeader()

  useEffect(() => {
    setHeader("Ocupação de Profissionais", analMes ? `Período: ${analMes}` : "")
    return () => setHeader("", "")
  }, [analMes, setHeader])

  // ── filtros ──
  const [ocupBusca,         setOcupBusca]         = useState('')
  const [ocupProfissionais, setOcupProfissionais] = useState<string[]>([])
  const [ocupEsp,           setOcupEsp]           = useState<string[]>([])
  const [ocupUnidades,      setOcupUnidades]      = useState<string[]>([])
  const [ocupCompareModo,   setOcupCompareModo]   = useState('')
  const [ocupCompareSlots,  setOcupCompareSlots]  = useState<string[]>([])
  const [ocupFaixa,         setOcupFaixa]         = useState('todos')
  const [ocupSort,          setOcupSort]          = useState('ocup_desc')

  // ── UI state ──
  const [painelAberto,    setPainelAberto]    = useState(false)
  const [buscaResetKey,   setBuscaResetKey]   = useState(0)
  const [dashboardAberto, setDashboardAberto] = useState(false)
  const [dashUnidAberto,  setDashUnidAberto]  = useState(false)
  const [espModal,        setEspModal]        = useState<DashEspItem | null>(null)
  const [unidadeAberto,   setUnidadeAberto]   = useState(false)
  const [espAberto,       setEspAberto]       = useState(false)
  const [diaTurnoAberto,  setDiaTurnoAberto]  = useState(false)
  const [cadastroAberto,  setCadastroAberto]  = useState(false)
  /** "Ocupação por dia" (agregado) vs "Ocupação por dia e turno" (detalhado) — mesmo interruptor pros cards de todos os profissionais. */
  const [verPorTurno,     setVerPorTurno]     = useState(true)
  const [profsAbertos,    setProfsAbertos]    = useState<Record<string, boolean>>({})

  // ── opções derivadas ──
  const unidadesFiltro = useMemo(() => {
    const set = new Set([...UNIDADES_DASHBOARD, UNIDADE_CORRIGIR])
    ;(allUnits ?? []).forEach(u => set.add(normalizarUnidadeOcupacao(u)))
    const ordem = [...UNIDADES_DASHBOARD, UNIDADE_CORRIGIR]
    return [...set].sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
    })
  }, [allUnits])

  const profissionaisFiltro = useMemo(() =>
    dadosPorProf.map(d => d.prof).sort((a, b) => a.localeCompare(b)),
  [dadosPorProf])

  const terapiasSomenteAdmin = useMemo(() =>
    (allTerps ?? []).filter(terp => {
      const slots = dadosPorProf.flatMap(d =>
        (d.ocupacao?.slots ?? []).filter(s => s.terp === terp)
      )
      return slots.length > 0 && slots.every(s => s.horarioAdministrativoEta || s.excluirBaseOcupacao)
    }),
  [allTerps, dadosPorProf])

  const terapiasPadrao = useMemo(() =>
    allTerps.filter(t => !terapiasSomenteAdmin.includes(t)),
  [allTerps, terapiasSomenteAdmin])

  // ── dados filtrados ──
  const dadosFiltrados = useMemo(() => {
    type ItemFiltrado = (typeof dadosPorProf)[number] & { taxaOcupacao: number | null }

    let r: ItemFiltrado[] = dadosPorProf.map(d => {
      const unsFiltro = ocupUnidades.includes('__none__') ? [] : ocupUnidades
      const oc = filtrarOcupacaoPorUnidade(d.ocupacao, unsFiltro)
      return { ...d, ocupacao: oc, taxaOcupacao: oc?.pct ?? null }
    })

    if (ocupProfissionais.includes('__none__'))    r = []
    else if (ocupProfissionais.length > 0)         r = r.filter(d => ocupProfissionais.includes(d.prof))

    const q = normTxt(ocupBusca.trim())
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean)
      r = r.filter(d => {
        const haystack = [
          normTxt(d.prof),
          ...d.terapiaDetails.map(t => normTxt(t.terp)),
          ...(d.ocupacao?.unidades ?? []).map(u => normTxt(u)),
        ].join(' ')
        return tokens.every(tok => haystack.includes(tok))
      })
    }

    if (ocupUnidades.includes('__none__'))         r = []
    else if (ocupUnidades.length > 0)              r = r.filter(d => (d.ocupacao?.slotsTotal ?? 0) > 0)

    const espFiltro = ocupEsp.length ? ocupEsp : terapiasPadrao
    if (ocupEsp.includes('__none__'))              r = []
    else if (espFiltro.length)                     r = r.filter(d =>
      espFiltro.some(esp => d.terapiaDetails.some(t => terapiaContemFiltro(t.terp, esp)))
    )

    if (ocupCompareModo && ocupCompareSlots.length) {
      const specs = ocupCompareSlots
        .map(key => OCUP_COMPARE_SLOTS.find(s => s.key === key))
        .filter(Boolean) as typeof OCUP_COMPARE_SLOTS
      r = r.filter(d => specs.every(spec => {
        const comparece = temComparecimentoNoTurno(d.ocupacao, spec.dow, spec.turno)
        return ocupCompareModo === 'comparece' ? comparece : !comparece
      }))
    }

    if (ocupFaixa !== 'todos') r = r.filter(d => dentroFaixaOcupacao(d.taxaOcupacao, ocupFaixa))

    return [...r].sort((a, b) => {
      if (ocupSort === 'ocios_desc') return ((b.ocupacao?.ociosidade ?? -1) - (a.ocupacao?.ociosidade ?? -1)) || a.prof.localeCompare(b.prof)
      if (ocupSort === 'alpha')      return a.prof.localeCompare(b.prof)
      return ((b.taxaOcupacao ?? -1) - (a.taxaOcupacao ?? -1)) || a.prof.localeCompare(b.prof)
    })
  }, [dadosPorProf, ocupBusca, ocupProfissionais, ocupUnidades, ocupEsp, terapiasPadrao, ocupCompareModo, ocupCompareSlots, ocupFaixa, ocupSort])

  // ── dashboard e resumos ──
  const espDashFiltro = useMemo(() =>
    ocupEsp.includes('__none__') ? [] : (ocupEsp.length ? ocupEsp : terapiasPadrao),
  [ocupEsp, terapiasPadrao])

  const dashboardEsp = useMemo(() =>
    dashboardPorEspecialidade(dadosFiltrados, espDashFiltro),
  [dadosFiltrados, espDashFiltro])

  const dashboardUnidades = useMemo(() =>
    [...UNIDADES_DASHBOARD, UNIDADE_CORRIGIR].map(unidade => {
      const b = novaBaseOcup()
      dadosFiltrados.forEach(d => {
        const oc = filtrarOcupacaoPorUnidade(d.ocupacao, [unidade])
        if (oc) somaBaseOcup(b, oc)
      })
      const f = finalizarBaseOcup(b)
      return { unidade, f, profissional: visaoProfissional(f) }
    }).filter(x => x.f.slotsTotal > 0),
  [dadosFiltrados])

  const porUnidade = useMemo((): LinhaResumo[] => {
    const mapa: Record<string, BaseOcup & { label: string }> = {}
    dadosFiltrados.forEach(d => {
      d.ocupacao?.porUnidade?.forEach(u => {
        const nome = u.unidade || 'Unidade não informada'
        if (!mapa[nome]) mapa[nome] = { label: nome, ...novaBaseOcup() }
        somaBaseOcup(mapa[nome], u)
      })
    })
    return Object.values(mapa).map(e => {
      const f = finalizarBaseOcup(e)
      return {
        label: e.label, pct: f.pct, baseCompacta: f.baseCompacta, baseTexto: f.baseTexto,
        horasOcupadas: f.horasOcupadas, horasLivres: f.horasLivres,
        capacidadeMultipla: f.capacidadeMultipla,
        horariosOcupados: f.horariosOcupados, horariosTotal: f.horariosTotal,
        slotsOcupados: f.slotsOcupados, slotsTotal: f.slotsTotal,
      }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }, [dadosFiltrados])

  const porEsp = useMemo((): LinhaResumo[] => {
    const mapa: Record<string, BaseOcup & { label: string }> = {}
    dadosFiltrados.forEach(d => {
      d.ocupacao?.porEspecialidade?.forEach(e => {
        if (!mapa[e.terp]) mapa[e.terp] = { label: e.terp, ...novaBaseOcup() }
        somaBaseOcup(mapa[e.terp], e)
      })
    })
    return Object.values(mapa).map(e => {
      const f = finalizarBaseOcup(e)
      return {
        label: e.label, pct: f.pct, baseCompacta: f.baseCompacta, baseTexto: f.baseTexto,
        horasOcupadas: f.horasOcupadas, horasLivres: f.horasLivres,
        capacidadeMultipla: f.capacidadeMultipla,
        horariosOcupados: f.horariosOcupados, horariosTotal: f.horariosTotal,
        slotsOcupados: f.slotsOcupados, slotsTotal: f.slotsTotal,
      }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }, [dadosFiltrados])

  const porDiaTurno = useMemo((): (LinhaResumo & { dow: number; turno: 'Manhã' | 'Tarde' })[] =>
    [1, 2, 3, 4, 5].flatMap(dow =>
      (['Manhã', 'Tarde'] as const).map(turno => {
        const b = novaBaseOcup()
        dadosFiltrados.forEach(d => {
          const x = d.ocupacao?.porTurno?.find(t => t.dow === dow && t.turno === turno)
          if (x) somaBaseOcup(b, x)
        })
        const f = finalizarBaseOcup(b)
        return {
          label: `${DOW_PT[dow]} · ${turno}`, dow, turno, ordem: dow * 2 + (turno === 'Tarde' ? 1 : 0),
          pct: f.pct, baseCompacta: f.baseCompacta, baseTexto: f.baseTexto,
          horasOcupadas: f.horasOcupadas, horasLivres: f.horasLivres,
          capacidadeMultipla: f.capacidadeMultipla,
          horariosOcupados: f.horariosOcupados, horariosTotal: f.horariosTotal,
          slotsOcupados: f.slotsOcupados, slotsTotal: f.slotsTotal,
        }
      })
    ),
  [dadosFiltrados])

  const toggleCompareSlot = useCallback((key: string) => {
    setOcupCompareSlots(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }, [])

  const limparFiltros = useCallback(() => {
    setOcupBusca('')
    setBuscaResetKey(k => k + 1)
    setOcupProfissionais([])
    setOcupEsp([])
    setOcupUnidades([])
    setOcupCompareModo('')
    setOcupCompareSlots([])
    setOcupFaixa('todos')
    setOcupSort('ocup_desc')
  }, [])

  const exportarXLSX = useCallback(() => {
    const r2 = (v: number) => Math.round(v * 100) / 100
    const pctVal  = (v: number | null) => v !== null ? r2(v * 100) : 0
    const ocioVal = (pct: number | null, ocio: number | null) =>
      ocio !== null ? r2(ocio * 100) : pct !== null ? r2((1 - pct) * 100) : 100

    // ── Folha 1: por (profissional, unidade, especialidade) ──────────────────
    const profRows: Record<string, unknown>[] = []
    for (const d of dadosFiltrados) {
      const grupos = new Map<string, typeof d.ocupacao.slots>()
      for (const s of d.ocupacao?.slots ?? []) {
        const k = `${s.unidade}\x00${s.terp}`
        if (!grupos.has(k)) grupos.set(k, [])
        grupos.get(k)!.push(s)
      }
      for (const [k, slots] of grupos) {
        const sep = k.indexOf('\x00')
        const unidade = k.slice(0, sep)
        const terp    = k.slice(sep + 1)
        const f = agregarOcupacaoDeSlots(slots)
        profRows.push({
          Profissional:   d.prof,
          Unidade:        unidade,
          Especialidades: terp,
          Ocupacao_percent:   pctVal(f.pct),
          Ociosidade_percent: ocioVal(f.pct, f.ociosidade),
          Base_Compacta:  f.baseCompacta,
          Base_do_Calculo: f.baseTexto,
          CH_Ocupada: r2(f.horasOcupadas),
          CH_Total:   r2(f.horasTotal),
          CH_Livre:   r2(f.horasLivres),
        })
      }
    }

    // ── Folha 2: por especialidade ───────────────────────────────────────────
    const espRows = dashboardEsp.map(e => ({
      Especialidade:  e.especialidade,
      Ocupacao_percent:   pctVal(e.pct),
      Ociosidade_percent: ocioVal(e.pct, e.ociosidade),
      Sessoes_Ocupadas: Math.round(e.horariosOcupados),
      Sessoes_Livres:   Math.round(e.horariosTotal - e.horariosOcupados),
      Sessoes_Total:    Math.round(e.horariosTotal),
      Base_Compacta:  e.baseCompacta,
      Base_do_Calculo: e.baseTexto,
      CH_Ocupada: r2(e.horasOcupadas),
      CH_Total:   r2(e.horasTotal),
      CH_Livre:   r2(e.horasLivres),
    }))

    // ── Folha 2b: por especialidade × unidade ────────────────────────────────
    const espUnidGrupos = new Map<string, typeof dadosFiltrados[number]['ocupacao']['slots']>()
    for (const d of dadosFiltrados) {
      for (const s of d.ocupacao?.slots ?? []) {
        const k = `${s.terp}\x00${s.unidade}`
        if (!espUnidGrupos.has(k)) espUnidGrupos.set(k, [])
        espUnidGrupos.get(k)!.push(s)
      }
    }
    const espUnidRows = [...espUnidGrupos.entries()].map(([k, slots]) => {
      const sep = k.indexOf('\x00')
      const terp    = k.slice(0, sep)
      const unidade = k.slice(sep + 1)
      const f = agregarOcupacaoDeSlots(slots)
      return {
        Especialidade:  terp,
        Unidade:        unidade,
        Ocupacao_percent:   pctVal(f.pct),
        Ociosidade_percent: ocioVal(f.pct, f.ociosidade),
        Sessoes_Ocupadas: Math.round(f.horariosOcupados),
        Sessoes_Livres:   Math.round(f.horariosTotal - f.horariosOcupados),
        Sessoes_Total:    Math.round(f.horariosTotal),
        Base_Compacta:  f.baseCompacta,
        Base_do_Calculo: f.baseTexto,
        CH_Ocupada: r2(f.horasOcupadas),
        CH_Total:   r2(f.horasTotal),
        CH_Livre:   r2(f.horasLivres),
      }
    }).sort((a, b) => a.Especialidade.localeCompare(b.Especialidade) || a.Unidade.localeCompare(b.Unidade))

    // ── Folha 3: por unidade ─────────────────────────────────────────────────
    const unidRows = dashboardUnidades.map(u => ({
      Unidade:        u.unidade,
      Ocupacao_percent:   pctVal(u.f.pct),
      Ociosidade_percent: ocioVal(u.f.pct, u.f.ociosidade),
      Base_Compacta:  u.f.baseCompacta,
      Base_do_Calculo: u.f.baseTexto,
      CH_Ocupada: r2(u.f.horasOcupadas),
      CH_Total:   r2(u.f.horasTotal),
      CH_Livre:   r2(u.f.horasLivres),
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profRows),    'Ocupacao profissional')
    // Nomes de aba no Excel são limitados a 31 caracteres — "especialidade" e "unidades/unidade"
    // precisam ser abreviados pra caber ("Ocupacao especialidade - Todas Unids." tem 37).
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(espRows),     'Ocupacao espec. - Todas Unids.')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(espUnidRows), 'Ocupacao espec. - por Unid.')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unidRows),    'Ocupacao unidade')

    const nome = `Ocupacao_${(analMes ?? 'export').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '')}.xlsx`
    XLSX.writeFile(wb, nome)
  }, [dadosFiltrados, dashboardEsp, dashboardUnidades, analMes])

  const filtrosAtivos = Boolean(
    ocupBusca || ocupEsp.length || ocupUnidades.length ||
    ocupCompareModo || ocupCompareSlots.length || ocupFaixa !== 'todos' || ocupSort !== 'ocup_desc'
  )

  useEffect(() => {
    setRightContent(
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            key={buscaResetKey}
            type="search"
            defaultValue={ocupBusca}
            onChange={e => setOcupBusca(e.target.value)}
            placeholder="Busca"
            className="w-40 rounded-lg border border-border bg-card pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {dadosFiltrados.length}/{dadosPorProf.length} prof.
        </span>
        <button type="button" onClick={() => setPainelAberto(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
            painelAberto
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-border bg-card text-foreground hover:bg-muted/50"
          }`}>
          <SlidersHorizontal size={13} /> Filtros
        </button>
        {filtrosAtivos && (
          <button type="button" onClick={limparFiltros}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-card px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30">
            <X size={13} /> Limpar
          </button>
        )}
        <button type="button" onClick={exportarXLSX}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 active:scale-95 transition-colors">
          <Download size={13} />
          Exportar XLSX
        </button>
      </div>
    )
    return () => setRightContent(null)
  }, [dadosFiltrados.length, dadosPorProf.length, painelAberto, filtrosAtivos,
      buscaResetKey, limparFiltros, exportarXLSX, setRightContent])

  // ── estados de carregamento ──
  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Carregando ocupação...
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-24 text-sm text-destructive">
      Erro ao carregar dados: {error}
    </div>
  )

  if (!dadosPorProf.length) return (
    <div className="text-center py-16">
      <div className="font-bold text-lg mb-1 text-foreground">Nenhum dado para o período</div>
      <div className="text-sm text-muted-foreground">{analMes}</div>
      <div className="text-sm text-muted-foreground mt-1">Verifique se há grade importada para este período.</div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {painelAberto && (
        <div className="-mx-6 -mt-6 mb-6 border-b border-border bg-card px-6 py-4 space-y-3 sticky -top-6 z-20">
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_minmax(180px,0.8fr)] gap-2 items-start">
                <FiltroCheckbox titulo="Profissionais" opcoes={profissionaisFiltro} selecionados={ocupProfissionais} setSelecionados={setOcupProfissionais} />
                <FiltroCheckbox titulo="Terapias" opcoes={allTerps} selecionados={ocupEsp} setSelecionados={setOcupEsp} selecaoPadrao={terapiasPadrao} />
                <FiltroCheckbox titulo="Unidades" opcoes={unidadesFiltro} selecionados={ocupUnidades} setSelecionados={setOcupUnidades} />
                <FiltroRadio titulo="Ordenação" opcoes={OCUP_SORTS} selecionado={ocupSort} setSelecionado={setOcupSort} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] font-bold text-muted-foreground">Nível de ocupação:</span>
              <SegmentedTabs
                value={ocupFaixa}
                onChange={setOcupFaixa}
                tabs={OCUP_FAIXAS.map(f => ({ value: f.k, label: f.l }))}
                ariaLabel="Nível de ocupação"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-foreground">Agenda</span>
                {[
                  { k: 'comparece',     l: 'Comparece',     ativoCls: 'bg-emerald-600 text-white dark:bg-emerald-500' },
                  { k: 'nao_comparece', l: 'Não comparece', ativoCls: 'bg-rose-600 text-white dark:bg-rose-500' },
                ].map(opt => {
                  const ativo = ocupCompareModo === opt.k
                  return (
                    <button key={opt.k} type="button"
                      onClick={() => setOcupCompareModo(prev => prev === opt.k ? '' : opt.k)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        ativo ? `border-transparent ${opt.ativoCls}` : "border-border bg-transparent text-foreground hover:bg-muted/50"
                      }`}>
                      {opt.l}
                    </button>
                  )
                })}
                {ocupCompareModo && (
                  <button type="button" onClick={() => { setOcupCompareModo(''); setOcupCompareSlots([]) }}
                    className="text-[11px] text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 underline">
                    limpar agenda
                  </button>
                )}
              </div>
              {ocupCompareModo && (
                <div className="mt-2 grid grid-cols-1 lg:grid-cols-[70px_1fr] gap-1 text-xs">
                  {(['Manhã', 'Tarde'] as const).map(row => (
                    <div key={row} className="contents">
                      <div className={`font-bold py-1 ${row === 'Manhã' ? 'text-sky-700 dark:text-sky-400' : 'text-violet-700 dark:text-violet-400'}`}>{row}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {OCUP_COMPARE_SLOTS.filter(s => s.row === row).map(s => {
                          const ativo = ocupCompareSlots.includes(s.key)
                          const ativoCls = row === 'Manhã' ? 'bg-sky-600 text-white dark:bg-sky-500' : 'bg-violet-600 text-white dark:bg-violet-500'
                          const inativoCls = row === 'Manhã' ? 'border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-400' : 'border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-400'
                          return (
                            <button key={s.key} type="button" onClick={() => toggleCompareSlot(s.key)}
                              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors ${
                                ativo ? `border-transparent ${ativoCls}` : `bg-transparent hover:bg-muted/50 ${inativoCls}`
                              }`}>
                              {s.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      )}

      <div className="max-w-[1800px] mx-auto">

      {/* ── dashboard especialidade ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-3">
        <button type="button" onClick={() => setDashboardAberto(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
          <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
            {dashboardAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
            <TipoSecaoBadge tipo="dashboard" />
            Especialidade
          </span>
          <span className="text-xs text-muted-foreground">{dashboardEsp.length} especialidade(s)</span>
        </button>
        {dashboardAberto && (
          <div className="px-4 pb-4">
            {!dashboardEsp.length ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Nenhuma especialidade nos filtros atuais.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {dashboardEsp.map(e => {
                  const tone = toneOcupacao(e.pct)
                  const Icon = iconeTerapia(e.especialidade)
                  return (
                    <StatCard key={e.especialidade} tone={tone} tinted={false}
                      icon={<Icon size={15} />}
                      label={<span className="truncate" title={e.especialidade}>{e.especialidade}</span>}>
                      <div className="text-2xl font-black leading-none" style={{ color: TONE_ACCENT[tone] }}>
                        {fmtPctOcup(e.pct)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {fmtH(e.horasLivres)} livres · {e.profissionaisQtd} {e.profissionaisQtd !== 1 ? 'profissionais' : 'profissional'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEspModal(e)}
                        className="mt-2 w-full rounded-lg py-1 text-[11px] font-semibold text-center bg-muted hover:bg-muted/70 text-foreground transition-colors">
                        Ver {e.profissionaisQtd !== 1 ? 'profissionais' : 'profissional'} →
                      </button>
                    </StatCard>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── dashboard unidades ── */}
      {dashboardUnidades.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden mb-3">
          <button type="button" onClick={() => setDashUnidAberto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              {dashUnidAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <TipoSecaoBadge tipo="dashboard" />
              Unidades
            </span>
            <span className="text-xs text-muted-foreground">{dashboardUnidades.length} unidade(s)</span>
          </button>
          {dashUnidAberto && (
            <div className="px-4 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {dashboardUnidades.map(({ unidade, f }) => {
                  const tone = toneOcupacao(f.pct)
                  return (
                    <StatCard key={unidade} tone={tone} tinted={false}
                      icon={<Building2 size={15} />}
                      label={<span className="truncate" title={unidade}>{unidade}</span>}>
                      <div className="text-2xl font-black leading-none" style={{ color: TONE_ACCENT[tone] }}>
                        {fmtPctOcup(f.pct)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {fmtH(f.horasLivres)} livres · {f.baseCompacta || '—'}
                      </div>
                    </StatCard>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── resumos colapsáveis ── */}
      <div className="space-y-2 mb-3">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button type="button" onClick={() => setUnidadeAberto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              {unidadeAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <TipoSecaoBadge tipo="tabela" />
              Unidades
            </span>
            <span className="text-xs text-muted-foreground">{porUnidade.length} unidade(s)</span>
          </button>
          {unidadeAberto && <div className="px-4 pb-4"><TabelaResumo linhas={porUnidade} /></div>}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button type="button" onClick={() => setEspAberto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              {espAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <TipoSecaoBadge tipo="tabela" />
              Especialidades
            </span>
            <span className="text-xs text-muted-foreground">{porEsp.length} especialidade(s)</span>
          </button>
          {espAberto && <div className="px-4 pb-4"><TabelaResumo linhas={porEsp} /></div>}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button type="button" onClick={() => setDiaTurnoAberto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              {diaTurnoAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <TipoSecaoBadge tipo="tabela" />
              Dia × turno
            </span>
            <span className="text-xs text-muted-foreground">segunda a sexta</span>
          </button>
          {diaTurnoAberto && (
            <div className="px-4 pb-4">
              <TabelaResumo linhas={porDiaTurno} sortPadrao={{ key: 'ordem', dir: 'asc' }} recorteSortKey="ordem" />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button type="button" onClick={() => setCadastroAberto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50">
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              {cadastroAberto ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <TipoSecaoBadge tipo="cadastro" />
              Quantidade esperada de pacientes
            </span>
            <span className="text-xs text-muted-foreground">{dadosPorProf.length} profissional(is)</span>
          </button>
          {cadastroAberto && (
            <div className="px-4 pb-4">
              <CadastroCapacidadeProfissionalDia
                dadosPorProf={dadosPorProf}
                capacidadeOverrides={capacidadeOverrides}
                onSalvar={salvarCapacidadeProfissionalDia}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── cards de profissionais ── */}
      <div className="space-y-2">
        {dadosFiltrados.map(d => {
          const temRegraEspecial = !!regrasCapacidadeTexto(d, capacidadeOverrides)
          const temAdmin         = (d.ocupacao?.horasTecnicas ?? 0) > 0
          const aberto           = !!profsAbertos[d.prof]
          const pctVal           = Math.max(0, Math.min(100, (Number(d.taxaOcupacao) || 0) * 100))
          const corPct           = corFaixaOcupacao(d.taxaOcupacao)
          const baseTxt          = d.ocupacao?.baseCompacta || '—'
          const resumoUnidade    = resumoUnidadesAgenda(d.ocupacao?.slots)
          const unidadeSoUma     = resumoUnidade?.startsWith('Sempre ')

          return (
            <div key={d.prof}
              className="rounded-xl border border-border bg-card overflow-hidden"
              style={{ borderLeft: `4px solid ${corPct}` }}>

              {/* cabeçalho do card */}
              <button type="button"
                onClick={() => setProfsAbertos(prev => ({ ...prev, [d.prof]: !prev[d.prof] }))}
                className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,480px)_minmax(180px,1fr)_80px] gap-2 lg:gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-muted-foreground">
                        {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="font-bold truncate text-foreground" title={d.prof}>{d.prof}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 pl-5 text-[10px] text-muted-foreground leading-tight">
                      <span className="truncate" title={d.terapiaDetails.map(t => t.terp).join(' · ')}>
                        {d.terapiaDetails.map(t => t.terp).join(' · ')}
                      </span>
                      {d.ocupacao?.unidadeTexto && (
                        <span className="truncate" style={{ color: B.blue }}>· {d.ocupacao.unidadeTexto}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="h-1.5 rounded-full overflow-hidden bg-muted border border-border">
                      <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: corPct }} />
                    </div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground truncate">{baseTxt}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black leading-none" style={{ color: corPct }}>
                      {fmtPctOcup(d.taxaOcupacao)}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {baseTxt}
                    </div>
                  </div>
                </div>
              </button>

              {/* detalhe expandido */}
              {aberto && (
                <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="overflow-x-auto">
                    <div className="inline-grid gap-4 items-start"
                      style={{ gridTemplateColumns: '300px 320px minmax(300px, 760px)', minWidth: 'min-content' }}>

                      {/* donut */}
                      <div className="rounded-2xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                        <OcupacaoDonut item={d} size={148} centerFillClassName="fill-muted" ringStrokeClassName="stroke-muted" />
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                          <div className="rounded-lg bg-rose-50 px-2 py-2 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                            <strong className="text-sm">{fmtH(d.ocupacao?.horasOcupadas ?? 0)}</strong>
                            <div>ocupadas</div>
                          </div>
                          <div className="rounded-lg bg-emerald-50 px-2 py-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <strong className="text-sm">{fmtH(d.ocupacao?.horasLivres ?? 0)}</strong>
                            <div>livres</div>
                          </div>
                          {temAdmin && (
                            <div className="col-span-2 rounded-lg bg-violet-50 px-2 py-2 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400">
                              <strong>{fmtHDec(d.ocupacao?.horasTecnicas ?? 0)}</strong> em Horário Administrativo
                            </div>
                          )}
                        </div>
                      </div>

                      {/* agenda */}
                      <AgendaMinimalista ocupacao={d.ocupacao} />

                      {/* tabelas por dia e por especialidade */}
                      <div className="flex flex-col gap-3">

                        {/* por dia (ou por dia e turno) */}
                        <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                          <div className="font-bold text-xs mb-1 flex items-center gap-1.5 text-foreground">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: B.purple, flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Ocupação por dia{verPorTurno ? ' e turno' : ''}{unidadeSoUma ? ` · ${resumoUnidade}` : ''}
                            <button
                              type="button"
                              onClick={() => setVerPorTurno(v => !v)}
                              title={verPorTurno ? 'Ver agregado só por dia' : 'Ver detalhado por dia e turno'}
                              className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              {verPorTurno ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                          </div>
                          {temRegraEspecial && (
                            <div className="text-[11px] font-semibold mb-2" style={{ color: B.purple }}>
                              {regrasCapacidadeTexto(d, capacidadeOverrides)}
                            </div>
                          )}
                          <table className="w-full table-fixed text-xs">
                            <thead>
                              <tr className="text-muted-foreground text-[11px] border-b">
                                <th className="w-24 text-left px-1 pb-2 pt-1 font-medium">Unidade</th>
                                <th className="w-28 text-left px-1 pb-2 pt-1 font-medium">Dia</th>
                                {temRegraEspecial ? (
                                  <>
                                    <th className="text-right px-1 pb-2 pt-1 font-medium whitespace-nowrap">Sessões simult.</th>
                                    <th className="text-left px-1 pb-2 pt-1 font-medium whitespace-nowrap">% ocup. vagas</th>
                                    <th className="text-right px-1 pb-2 pt-1 font-medium">Horários</th>
                                    <th className="text-right px-1 pb-2 pt-1 font-medium whitespace-nowrap">% ocup. horários</th>
                                  </>
                                ) : (
                                  <>
                                    <th className="text-left px-1 pb-2 pt-1 font-medium">% ocup. vagas</th>
                                    <th className="text-right px-1 pb-2 pt-1 font-medium w-24">Base</th>
                                  </>
                                )}
                                <th className="text-right px-1 pb-2 pt-1 font-medium">Livre</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(verPorTurno ? (d.ocupacao?.porTurno ?? []) : (d.ocupacao?.porDia ?? [])).filter(temBaseOcupacaoLinha).map(x => {
                                const turno = 'turno' in x ? x.turno : undefined
                                const uDia = turno
                                  ? unidadeDiaTurnoAgenda(d.ocupacao?.slots, x.dow, turno)
                                  : unidadeDiaAgenda(d.ocupacao?.slots, x.dow)
                                const pctSess = x.capacidadeMultipla && x.horariosTotal > 0
                                  ? x.horariosOcupados / x.horariosTotal : null
                                const cor = corFaixaOcupacao(x.pct) ?? B.green
                                const corSess = corFaixaOcupacao(pctSess) ?? B.green
                                const pctNum = Math.max(0, Math.min(100, (Number(x.pct) || 0) * 100))
                                const pctVagasCel = (
                                  <td className="px-1 py-2" style={{ minWidth: 160 }}>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block min-w-[4.4rem] rounded-full px-2.5 py-0.5 text-center font-bold whitespace-nowrap text-xs"
                                        style={{ background: `${cor}22`, color: cor, border: `1.5px solid ${cor}55` }}>
                                        {fmtPctOcup(x.pct)}
                                      </span>
                                      <div className="flex-1 h-1.5 rounded-full bg-muted min-w-[48px]">
                                        <div className="h-full rounded-full" style={{ width: `${pctNum}%`, background: cor }} />
                                      </div>
                                    </div>
                                  </td>
                                )
                                return (
                                  <tr key={turno ? `${x.dow}-${turno}` : x.dow} className="border-t">
                                    <td className="px-1 py-2 truncate text-muted-foreground" title={uDia || undefined}>
                                      {uDia || '—'}
                                    </td>
                                    <td className="px-1 py-2">
                                      <div className="truncate font-medium">{DOW_LABEL[x.dow]}{turno ? ` - ${turno}` : ''}</div>
                                    </td>
                                    {temRegraEspecial ? (
                                      <>
                                        <td className="px-1 py-2 text-right">
                                          <span className="inline-block rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap"
                                            style={{ background: `${cor}22`, color: cor, border: `1.5px solid ${cor}55` }}>
                                            {Math.round(x.slotsOcupados)} / {Math.round(x.slotsTotal)}
                                          </span>
                                        </td>
                                        {pctVagasCel}
                                        <td className="px-1 py-2 text-right">
                                          {x.capacidadeMultipla ? (
                                            <div className="font-semibold text-foreground whitespace-nowrap">
                                              {Math.round(x.horariosOcupados)} / {Math.round(x.horariosTotal)}
                                            </div>
                                          ) : (
                                            <span className="text-muted-foreground/50 text-sm">—</span>
                                          )}
                                        </td>
                                        <td className="px-1 py-2 text-right">
                                          {pctSess !== null ? (
                                            <span className="inline-block rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap"
                                              style={{ background: `${corSess}22`, color: corSess, border: `1.5px solid ${corSess}55` }}>
                                              {fmtPctOcup(pctSess)}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground/50 text-sm">—</span>
                                          )}
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        {pctVagasCel}
                                        <td className="px-1 py-2 text-right whitespace-nowrap text-muted-foreground">
                                          {x.baseCompacta || '—'}
                                        </td>
                                      </>
                                    )}
                                    <td className="px-1 py-2 text-right whitespace-nowrap font-semibold" style={{ color: B.red }}>
                                      {fmtH(x.horasLivres)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* por especialidade */}
                        {(d.ocupacao?.porEspecialidade?.length ?? 0) > 0 && (
                          <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                            <div className="font-bold text-xs mb-2 text-foreground">Ocupação por especialidade</div>
                            <table className="w-full table-fixed text-xs">
                              <thead>
                                <tr className="text-muted-foreground text-[11px] border-b">
                                  <th className="w-32 text-left px-1 pb-2 pt-1 font-medium">Especialidade</th>
                                  {temRegraEspecial ? (
                                    <>
                                      <th className="text-right px-1 pb-2 pt-1 font-medium whitespace-nowrap">Sessões simult.</th>
                                      <th className="text-left px-1 pb-2 pt-1 font-medium whitespace-nowrap">% ocup. vagas</th>
                                      <th className="text-right px-1 pb-2 pt-1 font-medium">Horários</th>
                                      <th className="text-right px-1 pb-2 pt-1 font-medium whitespace-nowrap">% ocup. horários</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="text-left px-1 pb-2 pt-1 font-medium">% ocup. vagas</th>
                                      <th className="text-right px-1 pb-2 pt-1 font-medium w-24">Base</th>
                                    </>
                                  )}
                                  <th className="text-right px-1 pb-2 pt-1 font-medium">Livre</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.ocupacao?.porEspecialidade?.map(x => {
                                  const pctSessEsp = x.capacidadeMultipla && x.horariosTotal > 0
                                    ? x.horariosOcupados / x.horariosTotal : null
                                  const corEsp = corFaixaOcupacao(x.pct) ?? B.green
                                  const corSessEsp = corFaixaOcupacao(pctSessEsp) ?? B.green
                                  const pctNumEsp = Math.max(0, Math.min(100, (Number(x.pct) || 0) * 100))
                                  const pctVagasCelEsp = (
                                    <td className="px-1 py-2" style={{ minWidth: 140 }}>
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block min-w-[4.4rem] rounded-full px-2.5 py-0.5 text-center font-bold whitespace-nowrap text-xs"
                                          style={{ background: `${corEsp}22`, color: corEsp, border: `1.5px solid ${corEsp}55` }}>
                                          {fmtPctOcup(x.pct)}
                                        </span>
                                        <div className="flex-1 h-1.5 rounded-full bg-muted min-w-[48px]">
                                          <div className="h-full rounded-full" style={{ width: `${pctNumEsp}%`, background: corEsp }} />
                                        </div>
                                      </div>
                                    </td>
                                  )
                                  return (
                                    <tr key={x.terp} className="border-t">
                                      <td className="px-1 py-2 truncate max-w-[120px]" title={x.terp}>{x.terp}</td>
                                      {temRegraEspecial ? (
                                        <>
                                          <td className="px-1 py-2 text-right">
                                            <span className="inline-block rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap"
                                              style={{ background: `${corEsp}22`, color: corEsp, border: `1.5px solid ${corEsp}55` }}>
                                              {Math.round(x.slotsOcupados)} / {Math.round(x.slotsTotal)}
                                            </span>
                                          </td>
                                          {pctVagasCelEsp}
                                          <td className="px-1 py-2 text-right">
                                            {x.capacidadeMultipla ? (
                                              <div className="font-semibold text-foreground whitespace-nowrap">
                                                {Math.round(x.horariosOcupados)} / {Math.round(x.horariosTotal)}
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground/50 text-sm">—</span>
                                            )}
                                          </td>
                                          <td className="px-1 py-2 text-right">
                                            {pctSessEsp !== null ? (
                                              <span className="inline-block rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap"
                                                style={{ background: `${corSessEsp}22`, color: corSessEsp, border: `1.5px solid ${corSessEsp}55` }}>
                                                {fmtPctOcup(pctSessEsp)}
                                              </span>
                                            ) : (
                                              <span className="text-muted-foreground/50 text-sm">—</span>
                                            )}
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          {pctVagasCelEsp}
                                          <td className="px-1 py-2 text-right whitespace-nowrap text-muted-foreground">{x.baseCompacta || '—'}</td>
                                        </>
                                      )}
                                      <td className="px-1 py-2 text-right whitespace-nowrap font-semibold" style={{ color: B.red }}>
                                        {fmtH(x.horasLivres)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {!dadosFiltrados.length && (
          <div className="text-center text-sm text-muted-foreground py-10 bg-card rounded-xl">
            Nenhum profissional dentro dos filtros de ocupação.
          </div>
        )}
      </div>

      {/* ── nota de cálculo ── */}
      <div className="mt-5 text-xs text-muted-foreground rounded-xl p-3 border"
        style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
        <strong className="text-foreground">Notas sobre o cálculo:</strong> sessões comuns usam sessões ocupadas ÷ sessões disponíveis. Musicoterapia usa vagas preenchidas ÷ capacidade total (múltiplos pacientes por sessão). Aplicador ABA EF usa capacidade de 2 pacientes por sessão. Horário Administrativo conta como ocupação técnica e aparece separado no detalhe do profissional.
      </div>
      </div>

      {/* ── modal: profissionais da especialidade ── */}
      {espModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setEspModal(null) }}>
          <div style={{ background: 'var(--card)', borderRadius: '18px', boxShadow: '0 20px 60px rgba(0,0,0,.25)', width: '100%', maxWidth: '420px', overflow: 'hidden' }}>
            {/* cabeçalho */}
            <div style={{ borderTop: `4px solid ${corTerapiaEsp(espModal.especialidade, corFaixaOcupacao(espModal.pct) ?? B.green)}`, padding: '18px 20px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--foreground)', lineHeight: 1.2 }}>
                    {espModal.especialidade}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 3 }}>
                    {espModal.profissionaisQtd} profissional{espModal.profissionaisQtd !== 1 ? 'is' : ''} · {fmtPctOcup(espModal.pct)} ocupação
                  </div>
                </div>
                <button type="button" onClick={() => setEspModal(null)}
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontFamily: 'inherit' }}>
                  ✕
                </button>
              </div>
            </div>
            {/* lista de profissionais */}
            <div style={{ padding: '4px 20px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {espModal.profissionaisNomes.map((nome, i) => (
                <div key={nome} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0',
                  borderBottom: i < espModal.profissionaisNomes.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--muted)', color: 'var(--foreground)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {nome.trim().charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--foreground)', fontWeight: 500 }}>{nome}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
