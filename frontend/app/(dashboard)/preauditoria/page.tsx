'use client'

import { useEffect, useState } from 'react'
import { listarAutorizacoes } from '@/services/autorizacoes.service'
import { getFunctionHeaders, getFunctionUrl } from '@/lib/supabase/functions'

export default function PreAuditoriaPage() {
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setLoading(true)
    const res = await listarAutorizacoes()
    setDados(res || [])
    setLoading(false)
  }

  async function sincronizar() {
    setSyncing(true)
    setMsg('Sincronizando...')

    try {
      const response = await fetch(getFunctionUrl('sync'), {
        method: 'POST',
        headers: await getFunctionHeaders(),
      })

      if (!response.ok) {
        const json = await response.json().catch(() => null)
        throw new Error(json?.message || 'Falha ao acionar o robô')
      }

      setMsg('Robô acionado 🚀')

      setTimeout(() => {
        carregar()
        setSyncing(false)
        setMsg('Dados atualizados ✅')
      }, 5000)

    } catch {
      setMsg('Erro ao sincronizar ❌')
      setSyncing(false)
    }
  }

  useEffect(() => {
    carregar()

    const interval = setInterval(carregar, 15000)
    return () => clearInterval(interval)
  }, [])

  // 🔥 NORMALIZAÇÃO DE STATUS
  function normalizarStatus(status: string) {
    if (!status) return 'desconhecido'

    const s = status.toLowerCase()

    if (s.includes('liberado') || s.includes('concluido')) return 'liberado'
    if (s.includes('erro')) return 'erro'

    return 'outro'
  }

  const total = dados.length
  const liberados = dados.filter(d => normalizarStatus(d.status) === 'liberado').length
  const erros = dados.filter(d => normalizarStatus(d.status) === 'erro').length
  const tokens = dados.filter(d => d.token && d.token !== '').length

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            Pré-Auditoria
          </h1>
          <p className="text-sm text-slate-500">
            Controle operacional das autorizações (visão administrativa)
          </p>
        </div>

        <button
          onClick={sincronizar}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-[#3A8FB7] text-white hover:opacity-90 disabled:opacity-50"
        >
          {syncing ? 'Sincronizando...' : '🔄 Atualizar'}
        </button>
      </div>

      {/* STATUS */}
      {msg && (
        <div className="text-sm text-slate-600">
          {msg}
        </div>
      )}

      {/* CARDS */}
      <div className="grid grid-cols-4 gap-4">
        <Card titulo="Total" valor={total} />
        <Card titulo="Liberados" valor={liberados} />
        <Card titulo="Erros" valor={erros} />
        <Card titulo="Tokens" valor={tokens} />
      </div>

      {/* TABELA */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-2 text-left">Paciente</th>
              <th className="p-2 text-center">Guia</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-center">TUSS</th>
              <th className="p-2 text-center">Token</th>
            </tr>
          </thead>

          <tbody>
            {dados.map((d, i) => (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td className="p-2">{d.paciente_nome}</td>

                <td className="p-2 text-center">
                  {d.guia || '-'}
                </td>

                <td className="p-2 text-center">
                  <StatusBadge status={normalizarStatus(d.status)} />
                </td>

                <td className="p-2 text-center">
                  {d.codigo_tuss || '-'}
                </td>

                <td className="p-2 text-center">
                  {d.token || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}

// 🔥 CARD
function Card({ titulo, valor }: any) {
  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="text-xl font-semibold text-slate-800">{valor}</p>
    </div>
  )
}

// 🔥 STATUS VISUAL
function StatusBadge({ status }: any) {
  const cores: any = {
    liberado: 'bg-green-100 text-green-700',
    erro: 'bg-red-100 text-red-700',
    outro: 'bg-gray-100 text-gray-600',
    desconhecido: 'bg-gray-100 text-gray-400'
  }

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${cores[status]}`}>
      {status}
    </span>
  )
}