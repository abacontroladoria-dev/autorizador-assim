'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardPlus } from 'lucide-react'

import {
  listarAutorizacoesAvulsas,
  type AutorizacaoAvulsa,
} from '@/services/autorizacoes-avulsas.service'

/**
 * As autorizações avulsas do mês — explicação, não fila de trabalho.
 *
 * POR QUE ISTO EXISTE AQUI
 * Uma avulsa é uma autorização a mais para o paciente que não cobre sessão
 * nenhuma. A guia dela NÃO aparece como órfã — `get_guias_orfas` exclui guia
 * capturada pelo Pulsar (20260824010000:119-124) —, então quem abre a semana de um
 * paciente e vê uma autorização sobrando não tinha onde ler que ela foi pedida de
 * propósito. Este painel é essa resposta: paciente, terapia, guia e o motivo que
 * quem pediu escreveu.
 *
 * Não há ação nenhuma aqui, e isso é deliberado: a avulsa já está resolvida por
 * construção. Oferecer "vincular" ou "descartar" convidaria o operador a triar o
 * que não é pendência.
 *
 * Nasce FECHADO. Na maioria dos meses a lista é vazia ou tem duas linhas, e um
 * painel aberto acima da listagem de pendências competiria por atenção com o
 * trabalho de verdade.
 */
export default function PainelAvulsas({ de, ate }: { de: string; ate: string }) {
  const [avulsas, setAvulsas] = useState<AutorizacaoAvulsa[]>([])
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    let cancelado = false

    listarAutorizacoesAvulsas(de, ate).then(({ data }) => {
      if (!cancelado) setAvulsas(data)
    })

    return () => {
      cancelado = true
    }
  }, [de, ate])

  // Sem avulsas no mês o painel não ocupa espaço — nem como linha vazia.
  if (avulsas.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ClipboardPlus size={14} className="shrink-0 text-slate-400" />
        <span className="text-[12px] font-semibold text-slate-700">
          Autorizações avulsas do período
        </span>
        <span className="text-[11px] text-slate-500">· {avulsas.length}</span>
        <span className="flex-1" />
        {aberto ? (
          <ChevronUp size={13} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-slate-400" />
        )}
      </button>

      {aberto && (
        <div className="border-t border-slate-100">
          {avulsas.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-50 px-3 py-2 last:border-b-0"
            >
              <span className="font-mono text-[11px] text-slate-500">
                {String(a.data_atendimento).slice(8, 10)}/{String(a.data_atendimento).slice(5, 7)}
              </span>
              <span className="text-[12px] font-medium text-slate-800">{a.paciente_nome}</span>
              <span className="text-[11px] text-slate-500">{a.terapia_nome}</span>
              {a.numero_autorizacao ? (
                <span className="font-mono text-[11px] text-slate-700">
                  guia {a.numero_autorizacao}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">sem guia</span>
              )}
              {/* O motivo é a razão de o painel existir: ele ganha a linha inteira
                  em vez de ser truncado ao lado dos outros campos. */}
              <span className="w-full text-[11px] text-slate-600">
                {a.motivo_avulsa || '—'}
                {a.criado_por ? ` · ${a.criado_por}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
