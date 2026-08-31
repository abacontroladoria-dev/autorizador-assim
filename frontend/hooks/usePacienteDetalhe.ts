"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getFichaMedica,
  getPacientePorId,
  upsertFichaMedica,
  upsertPaciente,
} from "@/services/pacientes.service"
import { getVinculosDoPaciente, salvarVinculos } from "@/services/responsaveis.service"
import { refetchPacientes } from "@/hooks/usePacientes"
import type { Paciente, PacienteEdit, PacienteFichaMedica } from "@/types/paciente"
import type { VinculoResponsavel, VinculoResponsavelEdit } from "@/types/responsavel"

// Estado do formulário de detalhe do paciente.
//
// Um único formulário atravessa as duas abas (Cadastro e Ficha médica) e as
// sub-seções. O estado mora AQUI, acima das abas, para trocar de aba não perder
// edição e para o contador de alterações somar as duas.

/** Tudo que o formulário edita, achatado — paciente + ficha + vínculos. */
export type PacienteForm = PacienteEdit & {
  ficha: Omit<PacienteFichaMedica, "paciente_id">
  vinculos: VinculoResponsavelEdit[]
}

const FICHA_VAZIA: Omit<PacienteFichaMedica, "paciente_id"> = {
  tipo_sanguineo: null,
  restricoes_alimentares: null,
  alergias: null,
  doencas: null,
  plano_saude_id: null,
  numero_carteirinha: null,
}

function montarForm(
  paciente: Paciente,
  ficha: PacienteFichaMedica | null,
  vinculos: VinculoResponsavel[]
): PacienteForm {
  return {
    id_paciente: paciente.id_paciente,
    nome: paciente.nome,
    tem_nome_civil: paciente.tem_nome_civil,
    nome_civil: paciente.nome_civil,
    cpf: paciente.cpf,
    data_nascimento: paciente.data_nascimento,
    sexo: paciente.sexo,
    cor_raca: paciente.cor_raca,
    estado_civil: paciente.estado_civil,
    rg: paciente.rg,
    rg_orgao_emissor: paciente.rg_orgao_emissor,
    rg_uf: paciente.rg_uf,
    rg_data_emissao: paciente.rg_data_emissao,
    email: paciente.email,
    telefone_residencial: paciente.telefone_residencial,
    falecido: paciente.falecido,
    ativo: paciente.ativo,
    ficticio: paciente.ficticio,
    observacoes: paciente.observacoes,
    lgpd_consentimento_em: paciente.lgpd_consentimento_em,

    cep: paciente.cep,
    logradouro: paciente.logradouro,
    numero: paciente.numero,
    complemento: paciente.complemento,
    bairro: paciente.bairro,
    cidade: paciente.cidade,
    uf: paciente.uf,

    // Colunas legadas de responsável: mantidas no payload para não zerar o que
    // o sync do TiTa gravou. A tela NÃO as edita — a verdade digitada vai para
    // `vinculos`. Ver a deprecação em 20260826100000.
    responsavel_nome: paciente.responsavel_nome,
    responsavel_cpf: paciente.responsavel_cpf,
    responsavel_email: paciente.responsavel_email,
    responsavel_telefone: paciente.responsavel_telefone,
    responsavel_parentesco: paciente.responsavel_parentesco,
    responsavel_financeiro: paciente.responsavel_financeiro,
    responsavel_financeiro_id: paciente.responsavel_financeiro_id,

    ficha: ficha
      ? {
          tipo_sanguineo: ficha.tipo_sanguineo,
          restricoes_alimentares: ficha.restricoes_alimentares,
          alergias: ficha.alergias,
          doencas: ficha.doencas,
          plano_saude_id: ficha.plano_saude_id,
          numero_carteirinha: ficha.numero_carteirinha,
        }
      : { ...FICHA_VAZIA },

    vinculos: vinculos.map((v) => ({
      responsavel_id: v.responsavel_id,
      tipo: v.tipo,
      parentesco: v.parentesco,
    })),
  }
}

export function usePacienteDetalhe(idPaciente: number) {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [vinculosOriginais, setVinculosOriginais] = useState<VinculoResponsavel[]>([])
  const [original, setOriginal] = useState<PacienteForm | null>(null)
  const [form, setForm] = useState<PacienteForm | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** Motivo da última falha de gravação, para a tela poder MOSTRAR o porquê. */
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [resPaciente, resFicha, resVinculos] = await Promise.all([
      getPacientePorId(idPaciente),
      getFichaMedica(idPaciente),
      getVinculosDoPaciente(idPaciente),
    ])

    if (resPaciente.error) {
      setErro(resPaciente.error)
      setCarregando(false)
      return
    }
    if (!resPaciente.data) {
      setErro("Paciente não encontrado.")
      setCarregando(false)
      return
    }

    const montado = montarForm(resPaciente.data, resFicha.data, resVinculos.data)
    setPaciente(resPaciente.data)
    setVinculosOriginais(resVinculos.data)
    setOriginal(montado)
    setForm(montado)
    setErro(null)
    setCarregando(false)
  }, [idPaciente])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const set = useCallback((patch: Partial<PacienteForm>) => {
    setForm((atual) => (atual ? { ...atual, ...patch } : atual))
  }, [])

  const setFicha = useCallback(
    (patch: Partial<Omit<PacienteFichaMedica, "paciente_id">>) => {
      setForm((atual) =>
        atual ? { ...atual, ficha: { ...atual.ficha, ...patch } } : atual
      )
    },
    []
  )

  // Comparação campo a campo. `ficha` e `vinculos` contam como UM campo cada —
  // o número que aparece na barra é "quantos campos você mexeu", e detalhar
  // dentro deles inflaria a conta sem ajudar.
  const camposSujos = useMemo(() => {
    const sujos = new Set<string>()
    if (!form || !original) return sujos

    for (const chave of Object.keys(form) as (keyof PacienteForm)[]) {
      if (chave === "ficha" || chave === "vinculos") continue
      if (form[chave] !== original[chave]) sujos.add(chave as string)
    }
    if (JSON.stringify(form.ficha) !== JSON.stringify(original.ficha)) sujos.add("ficha")
    if (JSON.stringify(form.vinculos) !== JSON.stringify(original.vinculos)) {
      sujos.add("vinculos")
    }
    return sujos
  }, [form, original])

  const dirtyCount = camposSujos.size

  const descartar = useCallback(() => {
    setForm(original)
  }, [original])

  const salvar = useCallback(async (): Promise<boolean> => {
    if (!form) return false
    setSalvando(true)
    setErroSalvar(null)
    try {
      const { ficha, vinculos, ...dadosPaciente } = form

      // Checkbox desmarcado tem que LIMPAR o nome civil, senão fica dado
      // fantasma: invisível na tela e presente no banco.
      const payload: PacienteEdit = {
        ...dadosPaciente,
        nome_civil: dadosPaciente.tem_nome_civil ? dadosPaciente.nome_civil : null,
      }

      const res = await upsertPaciente(payload)
      if (!res.ok) {
        setErroSalvar(res.error)
        return false
      }

      if (camposSujos.has("ficha")) {
        const resFicha = await upsertFichaMedica(
          { ...ficha, paciente_id: idPaciente },
          form.nome
        )
        if (!resFicha.ok) {
          setErroSalvar(resFicha.error)
          return false
        }
      }
      if (camposSujos.has("vinculos")) {
        const resVinculos = await salvarVinculos(idPaciente, vinculos, form.nome)
        if (!resVinculos.ok) {
          setErroSalvar(resVinculos.error)
          return false
        }
      }

      // O cache module-level de usePacientes não se invalida sozinho — sem isto
      // o usuário volta para a lista e vê o nome antigo.
      await refetchPacientes()
      await carregar()
      return true
    } finally {
      setSalvando(false)
    }
  }, [form, camposSujos, idPaciente, carregar])

  return {
    paciente,
    vinculosOriginais,
    form,
    set,
    setFicha,
    camposSujos,
    dirtyCount,
    carregando,
    erro,
    salvando,
    erroSalvar,
    limparErroSalvar: () => setErroSalvar(null),
    salvar,
    descartar,
    recarregar: carregar,
  }
}
