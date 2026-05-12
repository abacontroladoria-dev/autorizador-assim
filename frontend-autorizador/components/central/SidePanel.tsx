'use client'

import { useEffect, useState } from 'react'

import Timeline from './Timeline'

import StatusBadge from './StatusBadge'

import { buscarLogsFila } from '@/services/logs.service'

interface Props {
  atendimento: any
}

export default function SidePanel({
  atendimento,
}: Props) {

  const [logs, setLogs] =
    useState<any[]>([])

  const [loadingLogs, setLoadingLogs] =
    useState(false)

  useEffect(() => {

    async function carregarLogs() {

      if (!atendimento?.id) {
        setLogs([])
        return
      }

      setLoadingLogs(true)

      const response =
        await buscarLogsFila(
          atendimento.id
        )

      setLogs(response || [])

      setLoadingLogs(false)
    }

    carregarLogs()

  }, [atendimento?.id])

  if (!atendimento) {

    return (
<div className="
  sticky top-[170px]

  bg-white/90
  backdrop-blur-sm
  rounded-3xl
  border border-slate-200
  shadow-sm
  border border-slate-200/80
">
        Selecione um atendimento
      </div>
    )
  }

  return (

<div className="
  sticky top-[170px]	

  bg-white/90
  backdrop-blur-sm
  rounded-3xl
  border border-slate-200
  shadow-sm
  border border-slate-200/80
">

      {/* HEADER */}
      <div className="
        p-4
        border-b border-slate-100
      ">

<div>

  {/* NOME */}
  <h2 className="
    text-2xl
    font-bold
    text-slate-800
    leading-tight
  ">
    {atendimento.paciente_nome}
  </h2>

  {/* TERAPIA */}
  <p className="
    text-base
    text-slate-500
    mt-0.5
  ">
    {
      atendimento.classificacao_terapia ||
      atendimento.terapia_nome ||
      'Sem terapia'
    }
  </p>

  {/* STATUS */}
  <div className="mt-1.5">

    <StatusBadge
      status={
        atendimento.status_assim ||
        atendimento.status
      }
    />

  </div>

</div>



{/* INFO GRID */}
<div className="
  mt-5
  grid grid-cols-2
  gap-x-6
  gap-y-5
  text-sm
">

  <Info
    label="Horário"
    value={
      atendimento.horario
        ?.slice(0, 5)
      ||
      atendimento.hora_inicial
        ?.slice(0, 5)
    }
  />

  <Info
    label="Convênio"
    value={
      atendimento.convenio ||
      atendimento.convenio_nome
    }
  />

  <Info
    label="Unidade"
    value={
      atendimento.unidade
        ?.replace('Unid. ', '')
        ?.split(' - ')[0]
      ||
      atendimento.sala_nome
        ?.replace('Unid. ', '')
        ?.split(' - ')[0]
    }
  />

  <Info
    label="Terapeuta"
    value={
      atendimento.profissional_nome ||
      'Não informado'
    }
  />

</div>

      </div>

      {/* BODY */}
      <div className="
        p-4
        space-y-8
      ">

        {/* TIMELINE */}
        <section>

          <h3 className="
            text-sm
            font-semibold
            text-slate-800
            mb-4
          ">
            Timeline Operacional
          </h3>

          {loadingLogs ? (

            <div className="space-y-3">

              {[1, 2, 3].map(i => (

                <div
                  key={i}
                  className="
                    h-16
                    rounded-xl
                    bg-slate-100
                    animate-pulse
                  "
                />

              ))}

            </div>

          ) : (

            <Timeline logs={logs} />

          )}

        </section>

{/* INFO OPERACIONAIS */}
<section>

  <h3 className="
    text-sm
    font-semibold
    text-slate-800
    mb-4
  ">
    Informações Operacionais
  </h3>

  <div className="
    grid grid-cols-1
    gap-4
  ">

<Info
  label="Número autorização"
  value={
    atendimento.numero_autorizacao
  }
/>

<Info
  label="Horário autorização"
  value={
    atendimento.horario_autorizacao
      ? new Date(
          atendimento.horario_autorizacao
        ).toLocaleTimeString(
          'pt-BR',
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        )
      : '—'
  }
/>

<Info
  label="Atendido por"
  value={
    atendimento.usuario_nome ||
    'Não identificado'
  }
/>

    <Info
      label="Status"
      value={
        atendimento.status
      }
    />

  </div>

</section>

      </div>

    </div>
  )
}

function Info({
  label,
  value,
}: any) {

  return (
    <div>

      <p className="
        text-xs
        text-slate-400
        mb-1
      ">
        {label}
      </p>

      <p className="
        text-sm
        font-medium
        text-slate-700
        break-words
      ">
        {value || '—'}
      </p>

    </div>
  )
}