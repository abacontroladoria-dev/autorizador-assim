'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function OutrosConveniosPage() {
  const supabase = getSupabaseClient()

  const [lista, setLista] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)

    const { data, error } = await supabase
      .from('paciente_classificacao')
      .select('*')
      .eq('convenio_tipo', 'OUTRO_CONVENIO')
      .order('paciente_nome', { ascending: true })

    if (error) {
      console.error(error)
    } else {
      setLista(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  return (
    <div className="p-6 min-h-screen bg-slate-50">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-700">
          Outros Convênios
        </h1>
        <p className="text-sm text-slate-500">
          Pacientes que não são ASSIM Saúde
        </p>
      </div>

      {/* CONTEÚDO */}
      {loading ? (
        <p className="text-slate-400">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-slate-400">Nenhum paciente encontrado</p>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <div
              key={p.paciente_id}
              className="p-3 rounded-lg bg-white border border-slate-200 shadow-sm"
            >
              <span className="text-sm font-medium text-slate-700">
                {p.paciente_nome}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}