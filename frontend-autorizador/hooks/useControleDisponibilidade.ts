'use client'

import { useEffect, useState } from 'react'

import {
  atualizarStatusAtendimentosEmLote,
} from '@/services/controle-terapeutico.service'

export type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'
  | 'substituido'

export type HorarioEdicao = {
  id: number
  horario: string
  paciente: string
  statusAtual?: string | null
  selecionado: boolean
}

type GrupoBase = {
  terapeuta: string
  status: StatusDisponibilidade
  atendimentos: any[]
}

type Props = {
  getPaciente: (
    item: any
  ) => string

  onSuccess?: () => Promise<void> | void
}

export function useControleDisponibilidade({
  getPaciente,
  onSuccess,
}: Props) {

  const [
    modalStatus,
    setModalStatus,
  ] = useState<GrupoBase | null>(null)

  const [
    horariosEdicao,
    setHorariosEdicao,
  ] = useState<HorarioEdicao[]>([])

  const [
    novoStatusModal,
    setNovoStatusModal,
  ] = useState<StatusDisponibilidade>(
    'indisponivel'
  )

  const [
    salvandoStatus,
    setSalvandoStatus,
  ] = useState(false)

  const [
    erroStatus,
    setErroStatus,
  ] = useState<string | null>(null)

  function abrirModalStatus(
	  grupo: GrupoBase,
	  status: StatusDisponibilidade
	) {

	  setModalStatus(grupo)

	  setNovoStatusModal(status)
	}

  useEffect(() => {

    if (!modalStatus) return

	const lista =
	  modalStatus.atendimentos.map(
		(item: any) => {

		  return {
			id: item.tita_agendamento_id,

			horario: item.hora_inicial,

			paciente: getPaciente(item),

			statusAtual:
			  item.status,

			selecionado: true,
		  }
		}
	  )

    setHorariosEdicao(lista)

  }, [modalStatus, getPaciente])

  async function atualizarStatusDireto(
    grupo: GrupoBase,
    status: StatusDisponibilidade
  ) {

    const ids =
      grupo.atendimentos
        .map(
          (item: any) =>
            item.tita_agendamento_id
        )
        .filter(Boolean)

    if (ids.length === 0) {
      return
    }

    setSalvandoStatus(true)

    try {

      const resultado =
        await atualizarStatusAtendimentosEmLote({
          tita_agendamento_ids: ids,
          status,
        })

      if (!resultado) {
        setErroStatus('Erro ao salvar. Verifique sua conexão e tente novamente.')
        return
      }

      setErroStatus(null)

      if (onSuccess) {
        await onSuccess()
      }

    } finally {
      setSalvandoStatus(false)
    }
  }

  async function atualizarStatusSelecionado(
    grupo: GrupoBase,
    status: StatusDisponibilidade
  ) {

    const idsSelecionados =
      horariosEdicao
        .filter(
          (h) => h.selecionado
        )
        .map((h) => h.id)

    if (
      idsSelecionados.length === 0
    ) {
      return
    }

    setSalvandoStatus(true)

    try {

      const resultado =
        await atualizarStatusAtendimentosEmLote({
          tita_agendamento_ids:
            idsSelecionados,
          status,
        })

      if (!resultado) {
        setErroStatus('Erro ao salvar. Verifique sua conexão e tente novamente.')
        return
      }

      setErroStatus(null)
      setModalStatus(null)

      if (onSuccess) {
        await onSuccess()
      }

    } finally {
      setSalvandoStatus(false)
    }
  }

  function toggleHorario(
    id: number,
    checked: boolean
  ) {

    setHorariosEdicao((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              selecionado: checked,
            }
          : item
      )
    )
  }

  return {
    modalStatus,
    setModalStatus,

    horariosEdicao,

    novoStatusModal,

    salvandoStatus,

    erroStatus,
    setErroStatus,

    abrirModalStatus,

    atualizarStatusDireto,

    atualizarStatusSelecionado,

    toggleHorario,
  }
}