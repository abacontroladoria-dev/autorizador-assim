import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getCatalogoItens,
  getPlanejamentoSemestral,
  getRegistrosEntrega,
  salvarPlanejamentoSemestral,
  upsertRegistroEntrega,
  excluirRegistroEntrega,
  excluirPlanejamentoSemestral,
} from "@/services/pep.service"
import type { PepCatalogoItem, PepEvidencia, PepPlanejamentoSemestral, PepRegistroEntrega, PepStatusEntrega } from "@/types/pep"

// Estado e CRUD da tela de registro de entregas PEP (Analista do Comportamento),
// por prestador + competência. Não depende de nenhum upload de CSV — a fonte é
// o registro manual da clínica (Fase 2 do projeto "reestruturacao-entregas-
// analista-comportamento").
export function usePepEntregas(prestadorNome: string, competencia: string) {
  const [catalogo, setCatalogo] = useState<PepCatalogoItem[]>([])
  const [planejamento, setPlanejamento] = useState<PepPlanejamentoSemestral[]>([])
  const [registros, setRegistros] = useState<PepRegistroEntrega[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let cancelado = false
    getCatalogoItens().then(({ data, error }) => {
      if (cancelado) return
      if (error) setError("Não foi possível carregar o catálogo de itens da PEP.")
      setCatalogo(data ?? [])
    })
    return () => { cancelado = true }
  }, [])

  const recarregar = useCallback(async () => {
    if (!prestadorNome || !competencia) return
    setLoading(true)
    setError(null)
    const [plan, reg] = await Promise.all([
      getPlanejamentoSemestral(prestadorNome),
      getRegistrosEntrega(prestadorNome, competencia),
    ])
    if (plan.error || reg.error) setError("Não foi possível carregar o planejamento/registros da PEP.")
    setPlanejamento(plan.data ?? [])
    setRegistros(reg.data ?? [])
    setLoading(false)
  }, [prestadorNome, competencia])

  useEffect(() => { recarregar() }, [recarregar])

  const registroDe = useCallback(
    (pacienteNome: string | null, itemId: string) =>
      registros.find(r => r.item_id === itemId && (r.paciente_nome ?? null) === pacienteNome) ?? null,
    [registros]
  )

  const planejamentoDe = useCallback(
    (pacienteNome: string, itemId: string) =>
      planejamento.find(p => p.item_id === itemId && p.paciente_nome === pacienteNome) ?? null,
    [planejamento]
  )

  const marcarEntrega = useCallback(async (input: {
    pacienteNome: string | null
    pacienteCpf?: string | null
    itemId: string
    status: PepStatusEntrega
    observacao?: string | null
    evidencias?: PepEvidencia[]
    motivo?: string | null
  }) => {
    setSalvando(true)
    try {
      const { data, error } = await upsertRegistroEntrega({
        pacienteNome: input.pacienteNome,
        pacienteCpf: input.pacienteCpf,
        prestadorNome,
        itemId: input.itemId,
        competencia,
        status: input.status,
        evidencias: input.evidencias,
        observacao: input.observacao,
        motivo: input.motivo,
      })
      if (error) throw error
      if (data) setRegistros(prev => [...prev.filter(r => r.id !== data.id), data])
      return { ok: true as const }
    } catch (e) {
      setError("Não foi possível salvar o registro de entrega.")
      return { ok: false as const, error: e }
    } finally {
      setSalvando(false)
    }
  }, [prestadorNome, competencia])

  // Recorrentes podem ser entregues parcialmente no mês (ex.: 2 de 4
  // supervisões — TC2 do PRD). quantidadeEsperada vem do catálogo, já
  // ajustada pelo calendário parametrizado quando existir (Seção 9.11).
  const marcarQuantidade = useCallback(async (input: {
    pacienteNome: string | null
    pacienteCpf?: string | null
    itemId: string
    quantidadeEntregue: number
    quantidadeEsperada: number
    observacao?: string | null
    evidencias?: PepEvidencia[]
    motivo?: string | null
  }) => {
    setSalvando(true)
    try {
      const status: PepStatusEntrega = input.quantidadeEntregue >= input.quantidadeEsperada ? "entregue" : "pendente"
      const { data, error } = await upsertRegistroEntrega({
        pacienteNome: input.pacienteNome,
        pacienteCpf: input.pacienteCpf,
        prestadorNome,
        itemId: input.itemId,
        competencia,
        status,
        quantidadeEntregue: input.quantidadeEntregue,
        evidencias: input.evidencias,
        observacao: input.observacao,
        motivo: input.motivo,
      })
      if (error) throw error
      if (data) setRegistros(prev => [...prev.filter(r => r.id !== data.id), data])
      return { ok: true as const }
    } catch (e) {
      setError("Não foi possível salvar a quantidade entregue.")
      return { ok: false as const, error: e }
    } finally {
      setSalvando(false)
    }
  }, [prestadorNome, competencia])

  const cadastrarPlanejamento = useCallback(async (input: {
    pacienteNome: string
    pacienteCpf?: string | null
    itemId: string
    competenciaPlanejada: string
    reprogramarDe?: PepPlanejamentoSemestral | null
    origem?: PepPlanejamentoSemestral["origem"]
    motivo?: string | null
    evidencias?: PepEvidencia[]
  }) => {
    setSalvando(true)
    try {
      const { data, error } = await salvarPlanejamentoSemestral({
        pacienteNome: input.pacienteNome,
        pacienteCpf: input.pacienteCpf,
        prestadorNome,
        itemId: input.itemId,
        competenciaPlanejada: input.competenciaPlanejada,
        origem: input.origem ?? (input.reprogramarDe ? "reprogramacao_antecipada" : "inicial"),
        planejamentoAnteriorId: input.reprogramarDe?.id ?? null,
        motivo: input.motivo,
        evidencias: input.evidencias,
      })
      if (error) throw error
      if (data) setPlanejamento(prev => [...prev.filter(p => p.id !== input.reprogramarDe?.id), data])
      return { ok: true as const }
    } catch (e) {
      setError("Não foi possível salvar o planejamento semestral.")
      return { ok: false as const, error: e }
    } finally {
      setSalvando(false)
    }
  }, [prestadorNome])

  // PRD Seção 11.4 — exclusão é alteração manual, exige motivo e fica em
  // trilha de auditoria (pep_trilha_auditoria).
  const excluirRegistro = useCallback(async (input: {
    id: string
    pacienteNome: string | null
    motivo: string
  }) => {
    setSalvando(true)
    try {
      const { ok, error } = await excluirRegistroEntrega(input.id, {
        prestadorNome, pacienteNome: input.pacienteNome, competencia, motivo: input.motivo,
      })
      if (!ok) throw error
      setRegistros(prev => prev.filter(r => r.id !== input.id))
      return { ok: true as const }
    } catch (e) {
      setError("Não foi possível excluir o registro.")
      return { ok: false as const, error: e }
    } finally {
      setSalvando(false)
    }
  }, [prestadorNome, competencia])

  const excluirPlanejamento = useCallback(async (input: {
    id: string
    pacienteNome: string
    motivo: string
  }) => {
    setSalvando(true)
    try {
      const { ok, error } = await excluirPlanejamentoSemestral(input.id, {
        prestadorNome, pacienteNome: input.pacienteNome, competencia, motivo: input.motivo,
      })
      if (!ok) throw error
      setPlanejamento(prev => prev.filter(p => p.id !== input.id))
      return { ok: true as const }
    } catch (e) {
      setError("Não foi possível excluir o planejamento. Se ele já foi reprogramado, a linha anterior não pode ser apagada — isso preserva o histórico.")
      return { ok: false as const, error: e }
    } finally {
      setSalvando(false)
    }
  }, [prestadorNome, competencia])

  const itensRecorrentes = useMemo(() => catalogo.filter(i => i.classe === "recorrente"), [catalogo])
  const itensSemestrais = useMemo(() => catalogo.filter(i => i.classe === "semestral"), [catalogo])

  return {
    catalogo,
    itensRecorrentes,
    itensSemestrais,
    planejamento,
    registros,
    loading,
    error,
    salvando,
    registroDe,
    planejamentoDe,
    marcarEntrega,
    marcarQuantidade,
    excluirRegistro,
    excluirPlanejamento,
    cadastrarPlanejamento,
    recarregar,
  }
}
