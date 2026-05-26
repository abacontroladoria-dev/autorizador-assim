'use client'

import { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  TAXAS_PA_PADRAO, DIARIAS_PADRAO, CONTRATOS_ANTIGOS,
  CC_PA_DEFAULT, CC_PME_DEFAULT, ETA_BONUS_DEFAULT,
} from './lib/constants'
import { loadStore, saveStore, parseHtmlTable, normalizarRelatorioEvolucao, mesAnoDeLinhas } from './lib/helpers'
import {
  calcularAnalise, calcularRemuneracaoReal, calcularResumo,
  filtrarDados, calcularAnalMes, calcularPeriodo,
} from './lib/calculations'
import { buscarGradeParaAnalise } from './lib/gradeService'
import type {
  CsvRow, NormalizedSession, CalculatorConfig, ProfData, RealProfData,
  AnaliseResult, ResumoReal, FeriadoExtra, HistoricoSnapshot, ContratoAntigo,
} from './lib/types'

function mesAtual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Tipo do contexto ─────────────────────────────────────────────────────────
interface CalculadoraContextType {
  // Grade (carregada do banco)
  rows: CsvRow[];
  mesSelecionado: string;
  setMesSelecionado: React.Dispatch<React.SetStateAction<string>>;
  loadingGrade: boolean;

  // Relatório de evolução (upload manual)
  evoRows: NormalizedSession[];
  setEvoRows: (r: NormalizedSession[]) => void;
  evoName: string | null;
  setEvoName: (n: string | null) => void;
  evoFileRef: React.RefObject<HTMLInputElement | null>;
  handleRelatorioEvolucao: (f: File) => void;

  // Config
  taxasPA: Record<string, number>;
  setTaxasPA: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  diarias: Record<string, number>;
  setDiarias: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  etaBonus: number;
  setEtaBonus: React.Dispatch<React.SetStateAction<number>>;
  antigos: Record<string, ContratoAntigo>;
  setAntigos: React.Dispatch<React.SetStateAction<Record<string, ContratoAntigo>>>;
  limites: Record<string, number>;
  setLimites: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  presenca: number;
  setPresenca: React.Dispatch<React.SetStateAction<number>>;
  ccPA: number;
  setCcPA: React.Dispatch<React.SetStateAction<number>>;
  ccPME: number;
  setCcPME: React.Dispatch<React.SetStateAction<number>>;
  extraHols: FeriadoExtra[];
  setExtraHols: React.Dispatch<React.SetStateAction<FeriadoExtra[]>>;
  historico: HistoricoSnapshot[];
  setHistorico: React.Dispatch<React.SetStateAction<HistoricoSnapshot[]>>;

  // Resultados calculados
  dadosPorProf: ProfData[];
  feriadosMes: AnaliseResult['feriadosMes'];
  allTerps: string[];
  analMes: string | null;
  dadosFiltrados: ProfData[];
  remuneracaoReal: RealProfData[];
  remProfissionais: string[];
  remResumo: ResumoReal;
  remMes: string;
  remPeriodo: { inicio: string; fim: string } | null;

  // Estado de UI da análise (compartilhado entre AnaliseTab e suas sub-rotas)
  busca: string;
  setBusca: React.Dispatch<React.SetStateAction<string>>;
  filtrosEsp: string[];
  setFiltrosEsp: React.Dispatch<React.SetStateAction<string[]>>;
  expandido: Record<string, unknown>;
  setExpandido: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  analSort: string;
  setAnalSort: React.Dispatch<React.SetStateAction<string>>;

  // Estado de UI da apuração
  remBusca: string;
  setRemBusca: React.Dispatch<React.SetStateAction<string>>;
  remProfs: string[];
  setRemProfs: React.Dispatch<React.SetStateAction<string[]>>;
  remEspFiltro: string[];
  setRemEspFiltro: React.Dispatch<React.SetStateAction<string[]>>;
  remFiltroRapido: string;
  setRemFiltroRapido: React.Dispatch<React.SetStateAction<string>>;
  remunIndProf: string;
  setRemunIndProf: React.Dispatch<React.SetStateAction<string>>;
  configSub: string;
  setConfigSub: React.Dispatch<React.SetStateAction<string>>;

  // Funções de exportação
  exportarAnalise: () => void;
  exportarRemuneracao: () => void;
  salvarSnapshot: () => void;
}

const CalculadoraContext = createContext<CalculadoraContextType>(null!)

export function CalculadoraProvider({ children }: { children: React.ReactNode }) {
  const st = loadStore()

  // ── Grade do banco ────────────────────────────────────────────────────────
  const [rows,           setRows]           = useState<CsvRow[]>([])
  const [mesSelecionado, setMesSelecionado] = useState<string>(mesAtual)
  const [loadingGrade,   setLoadingGrade]   = useState(false)

  useEffect(() => {
    setLoadingGrade(true)
    buscarGradeParaAnalise(mesSelecionado)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoadingGrade(false))
  }, [mesSelecionado])

  // ── Relatório de evolução (upload manual) ─────────────────────────────────
  const [evoRows, setEvoRows] = useState<NormalizedSession[]>([])
  const [evoName, setEvoName] = useState<string | null>(null)
  const evoFileRef = useRef<HTMLInputElement>(null)

  // ── Config (carregada do localStorage) ───────────────────────────────────
  const [taxasPA,   setTaxasPA]   = useState<Record<string,number>>({ ...TAXAS_PA_PADRAO,   ...(st.taxasPA   || {}) })
  const [diarias,   setDiarias]   = useState<Record<string,number>>({ ...DIARIAS_PADRAO,    ...(st.diarias   || {}) })
  const [etaBonus,  setEtaBonus]  = useState<number>(st.etaBonus  ?? ETA_BONUS_DEFAULT)
  const [antigos,   setAntigos]   = useState<Record<string,ContratoAntigo>>({ ...CONTRATOS_ANTIGOS, ...(st.antigos || {}) })
  const [limites,   setLimites]   = useState<Record<string,number>>(st.limites  || {})
  const [presenca,  setPresenca]  = useState<number>(st.presenca  ?? 80)
  const [ccPA,      setCcPA]      = useState<number>(st.ccPA      ?? CC_PA_DEFAULT)
  const [ccPME,     setCcPME]     = useState<number>(st.ccPME     ?? CC_PME_DEFAULT)
  const [extraHols, setExtraHols] = useState<FeriadoExtra[]>(st.extraHols || [])
  const [historico, setHistorico] = useState<HistoricoSnapshot[]>(st.historico || [])

  // ── Estado de UI ──────────────────────────────────────────────────────────
  const [busca,          setBusca]          = useState('')
  const [filtrosEsp,     setFiltrosEsp]     = useState<string[]>(['todos'])
  const [expandido,      setExpandido]      = useState<Record<string, unknown>>({})
  const [analSort,       setAnalSort]       = useState('alpha')
  const [remBusca,       setRemBusca]       = useState('')
  const [remProfs,       setRemProfs]       = useState<string[]>([])
  const [remEspFiltro,   setRemEspFiltro]   = useState<string[]>([])
  const [remFiltroRapido,setRemFiltroRapido]= useState('todos')
  const [remunIndProf,   setRemunIndProf]   = useState('')
  const [configSub,      setConfigSub]      = useState('geral')

  // ── Persistência ──────────────────────────────────────────────────────────
  useEffect(() => {
    saveStore({ taxasPA, diarias, etaBonus, antigos, limites, presenca, ccPA, ccPME, extraHols, historico })
  }, [taxasPA, diarias, etaBonus, antigos, limites, presenca, ccPA, ccPME, extraHols, historico])

  // ── Upload Relatório Evolução ─────────────────────────────────────────────
  const handleRelatorioEvolucao = useCallback((f: File) => {
    setEvoName(f.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const text = String(ev.target?.result || '')
      let parsed: Record<string, string>[] = []
      try {
        parsed = parseHtmlTable(text)
        if (!parsed.length) {
          const wb = XLSX.read(text, { type: 'string' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          parsed = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[]
        }
      } catch (err) {
        console.error(err)
        alert('Não consegui ler o relatório. Envie o XLS exportado como tabela HTML/Excel ou CSV.')
      }
      const norm = normalizarRelatorioEvolucao(parsed)
      setEvoRows(norm)
    }
    reader.readAsText(f, 'UTF-8')
  }, [])

  // ── Cálculos memoizados ───────────────────────────────────────────────────
  const config: CalculatorConfig = { taxasPA, diarias, etaBonus, antigos, limites, presenca, ccPA, ccPME, extraHols, historico }

  const { dadosPorProf, feriadosMes, allTerps } = useMemo(
    () => calcularAnalise(rows, config),
    [rows, taxasPA, diarias, etaBonus, antigos, limites, presenca, ccPA, ccPME, extraHols]
  )

  const analMes = useMemo(() => calcularAnalMes(rows), [rows])

  const dadosFiltrados = useMemo(
    () => filtrarDados(dadosPorProf, busca, filtrosEsp),
    [dadosPorProf, busca, filtrosEsp]
  )

  const remuneracaoReal = useMemo(
    () => calcularRemuneracaoReal(evoRows, { taxasPA, diarias, antigos, ccPA, ccPME, etaBonus }),
    [evoRows, taxasPA, diarias, antigos, ccPA, ccPME, etaBonus]
  )

  const remProfissionais = useMemo(() => remuneracaoReal.map(p => p.prof).sort(), [remuneracaoReal])
  const remMes    = useMemo(() => mesAnoDeLinhas(evoRows), [evoRows])
  const remPeriodo = useMemo(() => calcularPeriodo(evoRows), [evoRows])

  const remResumo = useMemo(
    () => calcularResumo(evoRows, remuneracaoReal),
    [evoRows, remuneracaoReal]
  )

  // ── Exportar Análise ──────────────────────────────────────────────────────
  const exportarAnalise = useCallback(() => {
    if (!dadosFiltrados.length) { alert('Sem dados para o mês selecionado.'); return }
    const wb = XLSX.utils.book_new()
    const resumo = dadosFiltrados.map(d => ({
      Profissional: d.prof, Contrato: d.contrato || '',
      CH_Semanal_Contrato: d.chSemanal || 0,
      Terapias: d.terapiaDetails.map(t => t.terp).join('; '),
      Sessoes_Mes_100: d.terapiaDetails.reduce((s, t) => s + (t.sessoesMes100 || 0), 0),
      Sessoes_Semana: d.terapiaDetails.reduce((s, t) => s + (t.sessoes || 0), 0),
      Pacientes: d.allPacs.length,
      Horas_Com_Paciente: +(d.horasComPac.toFixed(2)),
      Horas_Abertas: +(d.horasAbertas.toFixed(2)),
      Horas_Total_Clinica: +(d.horasSemanaTotal.toFixed(2)),
      Contrato_Antigo: d.salAntigo || 0,
      Tem_Contrato_Antigo: d.temAntigo ? 'Sim' : 'Não',
      Valor_100: +(d.total100.toFixed(2)),
      Valor_Presenca_Config: +(d.totalX.toFixed(2)),
      Percentual_Presenca_Config: presenca,
      Variacao_100_pct: d.delta100 !== null ? +(d.delta100.toFixed(1)) : null,
      Variacao_Presenca_pct: d.deltaX !== null ? +(d.deltaX.toFixed(1)) : null,
      Alerta_CC: d.alertaCC ? 'Sim' : 'Não',
      Pacientes_CC: d.pacCC || 0,
      Limite_CC: d.limiteCC || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo analise')
    XLSX.writeFile(wb, `Analise_projecao_${(analMes || 'sem_mes').replace(/\s+/g, '_')}.xlsx`)
  }, [dadosFiltrados, analMes, presenca])

  // ── Exportar Apuração ─────────────────────────────────────────────────────
  const exportarRemuneracao = useCallback(() => {
    if (!evoRows.length) { alert('Importe primeiro o relatório de evolução detalhada.'); return }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(remuneracaoReal.map(p => ({
      Profissional: p.prof, Contrato: p.contrato,
      Sessoes_Agendadas: p.agendadas,
      Evolucoes_Proprias: p.evoluidasProprias,
      Substituicoes_Realizadas: p.substituicoesRealizadas,
      Total_Sessoes_Remuneraveis: p.evoluidasProprias + p.substituicoesRealizadas,
      Substituido_por_Outro: p.substituidoPorOutro,
      Pendentes_Retroativas: p.pendentes,
      Canceladas: p.canceladas,
      Nao_Evoluidas: p.naoEvoluidas,
      Inconsistencias: p.inconsistencias,
      Pacientes_Unicos: p.pacientesQtd,
      Pacientes_CC: p.pacientesCCQtd,
      PME_CC: p.pme,
      Contrato_Antigo_Salario: p.salAntigo,
      Tem_Contrato_Antigo: p.temAntigo ? 'Sim' : 'Não',
      Remuneracao_Confirmada: p.valorConfirmado,
      Potencial_Apos_Regularizacao: p.valorPotencial,
    }))), 'Resumo por profissional')

    const sessoesRecebe = remuneracaoReal.flatMap(p => p.sessoes
      .filter(s => s.papel === 'Substituição realizada' || (s.papel === 'Agenda' && s.classificacao === 'Evolução normal'))
      .map(s => ({
        Profissional: p.prof,
        Tipo: s.papel === 'Substituição realizada' ? 'Substituição realizada' : 'Evolução própria',
        Data: s.data, Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
        Profissional_Agenda: s.profAgenda, Profissional_Evolucao: s.profCsv,
        Presenca_Orbita: s.presencaOrbita, Possui_Tratativa: s.possuiTratativa,
        Valor_PA: s.especialidade === 'Coordenador de Caso' ? ccPA : (taxasPA[s.especialidade] ?? 0),
        Status_Financeiro: 'Recebe',
      })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesRecebe), 'Sessoes que pagam')

    const sessoesPend = remuneracaoReal.flatMap(p => p.sessoes
      .filter(s => s.papel !== 'Substituição realizada' && s.classificacao === 'Pendente retroativa')
      .map(s => ({
        Profissional: p.prof, Data: s.data, Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
        Profissional_Agenda: s.profAgenda, Presenca_Orbita: s.presencaOrbita, Possui_Tratativa: s.possuiTratativa,
        Valor_PA_Potencial: s.especialidade === 'Coordenador de Caso' ? ccPA : (taxasPA[s.especialidade] ?? 0),
        Acao: 'Regularizar evolução retroativa',
      })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesPend), 'Pendencias recuperaveis')

    const sessoesPerdidas = remuneracaoReal.flatMap(p => p.sessoes
      .filter(s => s.papel !== 'Substituição realizada' && s.classificacao === 'Substituição')
      .map(s => ({
        Profissional_Agenda: s.profAgenda, Profissional_Que_Evoluiu: s.profCsv,
        Data: s.data, Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
        Presenca_Orbita: s.presencaOrbita, Possui_Tratativa: s.possuiTratativa,
        Status_Financeiro: 'Não recebe: outro profissional evoluiu',
      })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesPerdidas), 'Perdidas para substituicao')

    const sessoesInc = evoRows
      .filter(r => ['Evolução sem presença', 'Cancelado evoluído'].includes(r.classificacao))
      .map(r => ({
        Data: r.data, Hora: r.hora, Paciente: r.paciente, Especialidade: r.especialidade,
        Profissional_Agenda: r.profAgenda, Profissional_Evolucao: r.profCsv,
        Presenca_Orbita: r.presencaOrbita, Possui_Tratativa: r.possuiTratativa,
        Status_Final: r.statusFinal, Tipo_Inconsistencia: r.classificacao,
        Acao_Recomendada: r.classificacao === 'Evolução sem presença'
          ? 'Verificar presença Órbita incorreta ou evolução indevida'
          : 'Verificar: sessão cancelada foi evoluída incorretamente',
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesInc), 'Inconsistencias')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      remuneracaoReal.filter(p => !p.temAntigo).map(p => ({
        Profissional: p.prof, Contrato: p.contrato || '', Salario_Antigo: 'Sem dados',
        Remuneracao_Confirmada: p.valorConfirmado,
      }))
    ), 'Contratos pendentes')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evoRows.map(r => ({
      ID: r.id, Data: r.data, Hora: r.hora, Paciente: r.paciente, Especialidade: r.especialidade,
      Profissional_Agenda: r.profAgenda, Profissional_Evolucao: r.profCsv,
      Presenca_Orbita: r.presencaOrbita, Possui_Tratativa: r.possuiTratativa,
      Status_CSV: r.statusCsv, Status_Final: r.statusFinal,
      Classificacao: r.classificacao, Motivo: r.motivo,
    }))), 'Base auditavel completa')
    XLSX.writeFile(wb, `Remuneracao_real_${remMes.replace(/\s+/g, '_')}.xlsx`)
  }, [evoRows, remuneracaoReal, remMes, ccPA, taxasPA])

  // ── Salvar snapshot histórico ─────────────────────────────────────────────
  const salvarSnapshot = useCallback(() => {
    if (!dadosPorProf.length) return
    const snap: HistoricoSnapshot = {
      id: Date.now(),
      mesStr: analMes || 'Sem mês',
      presenca,
      profs: dadosPorProf.map(d => ({ prof: d.prof, total100: d.total100, totalX: d.totalX, salAntigo: d.salAntigo })),
    }
    setHistorico(h => [...h, snap])
  }, [dadosPorProf, analMes, presenca])

  return (
    <CalculadoraContext.Provider value={{
      rows, mesSelecionado, setMesSelecionado, loadingGrade,
      evoRows, setEvoRows, evoName, setEvoName,
      evoFileRef, handleRelatorioEvolucao,
      taxasPA, setTaxasPA, diarias, setDiarias,
      etaBonus, setEtaBonus, antigos, setAntigos,
      limites, setLimites, presenca, setPresenca,
      ccPA, setCcPA, ccPME, setCcPME,
      extraHols, setExtraHols, historico, setHistorico,
      dadosPorProf, feriadosMes, allTerps, analMes, dadosFiltrados,
      remuneracaoReal, remProfissionais, remResumo, remMes, remPeriodo,
      busca, setBusca, filtrosEsp, setFiltrosEsp,
      expandido, setExpandido, analSort, setAnalSort,
      remBusca, setRemBusca, remProfs, setRemProfs,
      remEspFiltro, setRemEspFiltro, remFiltroRapido, setRemFiltroRapido,
      remunIndProf, setRemunIndProf, configSub, setConfigSub,
      exportarAnalise, exportarRemuneracao, salvarSnapshot,
    }}>
      <input ref={evoFileRef} type="file" accept=".xls,.xlsx,.csv,.html" hidden
        onChange={e => e.target.files?.[0] && handleRelatorioEvolucao(e.target.files[0])} />
      {children}
    </CalculadoraContext.Provider>
  )
}

export const useCalculadora = () => useContext(CalculadoraContext)
