"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { buscarGradeParaAnalise } from "@/lib/remuneracao/gradeRemuneracao"
import {
  calcularAnaliseFutura, calcularRemuneracaoReal, calcularPEProporcional,
  normalizarRelatorioPE, parsePeriodoArquivo, PE_INATIVO,
  type AnaliseFuturaResult, type ProfRemunReal, type PERow, type ContratoAntigoInfo, type CadastroContratual, type ContratoAtualItem,
  type DesligadosMap,
} from "@/lib/remuneracao/calculo"
import { normalizarGradeParaSessao, classificarSessaoReal, type SessaoReal, type CsvGradeRow } from "@/lib/remuneracao/relatorio"
import { buscarPresencaFilaAutorizacoes, presencaDaSessao, type PresencaIndice } from "@/lib/remuneracao/presencaReal"
import { dataParaISO, mesAnoDeLinhas } from "@/lib/remuneracao/datas"
import { isProfDesligado, limparPrefixoDesligado } from "@/lib/remuneracao/constants"
import { getContratos, getUltimoAtendimentoAtivo } from "@/services/remuneracao.service"
import { useParametrosGerais } from "./useParametrosGerais"
import { useTaxasEspecialidade } from "./useTaxasEspecialidade"
import { useFeriados } from "./useFeriados"
import type { CsvRow } from "@/types/cronograma"

// Um "contrato antigo" agora é só um item não-vigente na mesma lista de
// contratos (ver migration 20260710120000) — pega o de maior valorTotal
// como referência de comparação (mesmo profissional pode ter mais de um
// contrato antigo desativado ao longo do tempo).
function deriveAntigoDeContratos(contratos: ContratoAtualItem[]): ContratoAntigoInfo | null {
  const candidatos = (Array.isArray(contratos) ? contratos : [])
    .filter(c => c && c.vigente === false && Number(c.valorTotal || 0) > 0)
  if (!candidatos.length) return null
  const maior = candidatos.reduce((a, b) => (Number(b.valorTotal) > Number(a.valorTotal) ? b : a))
  return { salario: Number(maior.valorTotal), contrato: maior.numero || null }
}

export function useAnaliseFutura() {
  const { parametros, loading: parametrosLoading, error: parametrosError } = useParametrosGerais()
  const { taxas_pa, diarias, loading: taxasLoading } = useTaxasEspecialidade()
  const { feriados, loading: feriadosLoading } = useFeriados()
  const [rows, setRows] = useState<CsvRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(true)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [antigos, setAntigos] = useState<Record<string, ContratoAntigoInfo>>({})
  const [cadastroPrestadores, setCadastroPrestadores] = useState<Record<string, CadastroContratual>>({})
  const [contratosError, setContratosError] = useState<string | null>(null)
  const [desligados, setDesligados] = useState<DesligadosMap>({})
  const refWeek = useMemo(() => getRefWeek(), [])

  useEffect(() => {
    let isMounted = true
    async function load() {
      setRowsLoading(true)
      try {
        const data = await buscarGradeParaAnalise(refWeek.inicio, refWeek.fim)
        if (isMounted) setRows(data)
      } catch (e) {
        if (isMounted) setRowsError(e instanceof Error ? e.message : "Erro ao buscar grade.")
      } finally {
        if (isMounted) setRowsLoading(false)
      }
    }
    load()
    return () => { isMounted = false }
  }, [refWeek])

  // Quem aparece na grade como "INATIVO-<nome>", com o profissional_id que o TiTa
  // mantém estável mesmo depois do rename. Vazio = nada a consultar.
  const idsDesligados = useMemo(() => {
    const porNome = new Map<string, number>()
    for (const r of rows) {
      const nome = String(r["Profissional"] ?? "").trim()
      if (!nome || !isProfDesligado(nome) || porNome.has(nome)) continue
      const id = Number(r["Id Profissional"])
      if (Number.isFinite(id) && id > 0) porNome.set(nome, id)
    }
    return porNome
  }, [rows])

  // O agenda_tita resolve, pelo mesmo profissional_id, o nome limpo (chave do
  // cadastro de contrato) e a data do último atendimento ativo — que é o que
  // datamos como mês do desligamento.
  //
  // Sem ninguém marcado na grade o efeito não faz nada: entradas de uma grade
  // anterior podem sobrar no mapa sem efeito colateral, porque o cálculo só
  // consulta nomes que estão na grade atual E têm o prefixo.
  useEffect(() => {
    if (!idsDesligados.size) return
    let isMounted = true
    async function loadDesligados() {
      const { data: porId } = await getUltimoAtendimentoAtivo([...idsDesligados.values()])
      if (!isMounted) return

      const mapa: DesligadosMap = {}
      for (const [nome, id] of idsDesligados) {
        const encontrado = porId[id]
        mapa[nome] = {
          // Sem linha no agenda_tita, o prefixo removido é o melhor palpite de nome.
          nomeLimpo: encontrado?.nome || limparPrefixoDesligado(nome),
          mesUltimoAtendimento: encontrado ? encontrado.ultimaData.slice(0, 7) : null,
        }
      }
      setDesligados(mapa)
    }
    loadDesligados()
    return () => { isMounted = false }
  }, [idsDesligados])

  // Contratos (atuais + antigos, unificados) — cadastrados em Cadastros, não
  // dependem da semana de referência.
  useEffect(() => {
    let isMounted = true
    async function loadContratuais() {
      const { data: contratosData, error } = await getContratos()
      if (!isMounted) return

      // Sem propagar o erro, uma falha de RLS (a tabela exige role rp/admin/
      // diretoria) fazia a tela mostrar TODO mundo como "Sem contrato antigo
      // cadastrado" / "PS.ABA-PENDENTE", sem nenhum aviso.
      if (error) {
        setContratosError("Não foi possível carregar os contratos cadastrados — a projeção abaixo ignora contrato antigo e modalidade. Verifique sua permissão de acesso a contratos.")
        return
      }
      setContratosError(null)

      const antigosMap: Record<string, ContratoAntigoInfo> = {}
      const cadastroMap: Record<string, CadastroContratual> = {}
      ;(contratosData ?? []).forEach(r => {
        const contratos = Array.isArray(r.contratos) ? r.contratos : []
        cadastroMap[r.profissional_nome] = { nome: r.profissional_nome, contratosAtuais: contratos }
        const antigo = deriveAntigoDeContratos(contratos)
        if (antigo) antigosMap[r.profissional_nome] = antigo
      })

      setAntigos(antigosMap)
      setCadastroPrestadores(cadastroMap)
    }
    loadContratuais()
    return () => { isMounted = false }
  }, [])

  const resultado: AnaliseFuturaResult | null = useMemo(() => {
    if (!parametros || !rows.length) return null
    return calcularAnaliseFutura(rows, {
      taxasPA: taxas_pa,
      diarias,
      etaBonus: parametros.eta_bonus_default,
      ccPA: parametros.cc_pa_default,
      ccPE: parametros.cc_pe_default,
      ccLimDefault: parametros.cc_lim_default,
      presenca: parametros.presenca_padrao,
      feriados,
      antigos,
      cadastroPrestadores,
      desligados,
    })
  }, [parametros, taxas_pa, diarias, rows, antigos, cadastroPrestadores, desligados, feriados])

  const analMes = useMemo(() => (rows.length ? mesAnoDeLinhas(rows as unknown as Record<string, unknown>[]) : null), [rows])

  return {
    resultado,
    refWeek,
    analMes,
    presenca: parametros?.presenca_padrao ?? null,
    loading: parametrosLoading || taxasLoading || rowsLoading || feriadosLoading,
    error: parametrosError || rowsError,
    // Aviso, não erro bloqueante: sem os contratos a projeção de PA ainda serve.
    avisoContratos: contratosError,
    gradeVazia: !rowsLoading && rows.length === 0,
    totalGrade: rows.length,
  }
}

export function useRemunRP() {
  const { parametros, loading: parametrosLoading, error: parametrosError } = useParametrosGerais()
  const { taxas_pa, diarias, loading: taxasLoading } = useTaxasEspecialidade()
  const { feriados, loading: feriadosLoading } = useFeriados()
  const [evoRowsBase, setEvoRowsBase] = useState<SessaoReal[]>([])
  const [presencaIndice, setPresencaIndice] = useState<PresencaIndice>({ porId: new Map(), porChave: new Map() })
  const [csvName, setCsvName] = useState<string | null>(null)
  const [peRows, setPeRows] = useState<PERow[]>([])
  const [peName, setPeName] = useState<string | null>(null)
  const [antigos, setAntigos] = useState<Record<string, ContratoAntigoInfo>>({})
  const [cadastroPrestadores, setCadastroPrestadores] = useState<Record<string, CadastroContratual>>({})

  // Contratos (atuais + antigos, unificados) — cadastrados em Config, não
  // dependem da grade importada.
  useEffect(() => {
    let isMounted = true
    async function loadContratuais() {
      const { data: contratosData } = await getContratos()
      if (!isMounted) return

      const antigosMap: Record<string, ContratoAntigoInfo> = {}
      const cadastroMap: Record<string, CadastroContratual> = {}
      ;(contratosData ?? []).forEach(r => {
        const contratos = Array.isArray(r.contratos) ? r.contratos : []
        cadastroMap[r.profissional_nome] = { nome: r.profissional_nome, contratosAtuais: contratos }
        const antigo = deriveAntigoDeContratos(contratos)
        if (antigo) antigosMap[r.profissional_nome] = antigo
      })

      setAntigos(antigosMap)
      setCadastroPrestadores(cadastroMap)
    }
    loadContratuais()
    return () => { isMounted = false }
  }, [])

  const carregarGrade = useCallback((rows: Record<string, unknown>[]) => {
    setEvoRowsBase(normalizarGradeParaSessao(rows, feriados))
  }, [feriados])

  const limparGrade = useCallback(() => {
    setEvoRowsBase([])
    setPresencaIndice({ porId: new Map(), porChave: new Map() })
    setCsvName(null)
  }, [])

  // Cruza a grade carregada com fila_autorizacoes (mesma tabela usada por
  // cronograma/reposicao) para saber a presença real registrada pela recepção —
  // sem isso, presencaOrbita ("Presença Recep.") sai sempre "Sim" (ver
  // normalizarGradeParaSessao).
  useEffect(() => {
    const datasIso = evoRowsBase.map(r => dataParaISO(r.data)).filter(Boolean)
    if (datasIso.length === 0) {
      setPresencaIndice({ porId: new Map(), porChave: new Map() })
      return
    }
    let cancelled = false
    const dataMin = datasIso.reduce((a, b) => (b < a ? b : a))
    const dataMax = datasIso.reduce((a, b) => (b > a ? b : a))
    buscarPresencaFilaAutorizacoes(dataMin, dataMax).then(indice => {
      if (!cancelled) setPresencaIndice(indice)
    })
    return () => { cancelled = true }
  }, [evoRowsBase])

  // evoRows final: sobrepõe presencaOrbita conforme fila_autorizacoes — casando
  // primeiro pelo id do agendamento (mais confiável) e só then por
  // paciente+data+hora. Sessões sem registro na fila mantêm o fallback "Sim"
  // (mesmo comportamento de antes).
  const evoRows = useMemo(() => {
    if (presencaIndice.porId.size === 0 && presencaIndice.porChave.size === 0) return evoRowsBase
    return evoRowsBase.map(r => {
      const presente = presencaDaSessao(r.id, r.paciente, r.data, r.hora, presencaIndice)
      if (presente === undefined) return r
      const presencaOrbita = presente ? "Sim" : "Não"
      if (presencaOrbita === r.presencaOrbita) return r
      const atualizado = { ...r, presencaOrbita }
      atualizado.classificacao = classificarSessaoReal(atualizado, feriados)
      return atualizado
    })
  }, [evoRowsBase, presencaIndice, feriados])

  const carregarPE = useCallback((rows: CsvGradeRow[], fileName: string) => {
    setPeRows(normalizarRelatorioPE(rows, parsePeriodoArquivo(fileName)))
    setPeName(fileName)
  }, [])

  const limparPE = useCallback(() => {
    setPeRows([])
    setPeName(null)
  }, [])

  // Coordenadores de Caso "ativos": aparecem com essa especialidade na própria
  // grade enviada (adaptação — a calc original usava dadosPorProf da Análise
  // Futura, mas aqui as duas abas têm janelas de dados diferentes).
  const coordsAtivos = useMemo(
    () => [...new Set(evoRows.filter(r => r.especialidade === "Coordenador de Caso").map(r => r.profAgenda).filter(Boolean))],
    [evoRows]
  )

  const peAnaliseCompleta = evoRows.length > 0 && peRows.length > 0
  const peStatusMensagem = peAnaliseCompleta
    ? "PE calculado com relatórios 1 e 2."
    : "PE bloqueado: importe csv_grade_profissionais e agendamentos_profissionais para calcular com segurança."

  const peProporcional = useMemo(() => {
    if (!parametros || !peAnaliseCompleta) return PE_INATIVO
    return calcularPEProporcional(peRows, parametros.cc_pe_default, evoRows, coordsAtivos)
  }, [parametros, peAnaliseCompleta, peRows, evoRows, coordsAtivos])

  const resultado: ProfRemunReal[] | null = useMemo(() => {
    if (!parametros || !evoRows.length) return null
    return calcularRemuneracaoReal(evoRows, {
      taxasPA: taxas_pa,
      diarias,
      etaBonus: parametros.eta_bonus_default,
      ccPA: parametros.cc_pa_default,
      ccPE: parametros.cc_pe_default,
      antigos,
      cadastroPrestadores,
      peAnaliseCompleta,
      peProporcional,
      peStatusMensagem,
    })
  }, [parametros, taxas_pa, diarias, evoRows, antigos, cadastroPrestadores, peAnaliseCompleta, peProporcional, peStatusMensagem])

  return {
    resultado,
    presenca: parametros?.presenca_padrao ?? 80,
    evoRows,
    csvName,
    setCsvName,
    carregarGrade,
    limparGrade,
    peRows,
    peName,
    carregarPE,
    limparPE,
    peAnaliseCompleta,
    peStatusMensagem,
    cadastroPrestadores,
    loading: parametrosLoading || taxasLoading || feriadosLoading,
    error: parametrosError,
  }
}
