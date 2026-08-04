'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { buscarContadores, listarAlertas } from '@/services/alertas.service'
import type { Alerta, AlertasContadores } from '@/components/alertas/types'

const DEBOUNCE_MS = 600

const CONTADORES_ZERO: AlertasContadores = {
  abertos: 0,
  em_andamento: 0,
  criticos: 0,
  total_pendente: 0,
  conferidas_hoje: 0,
}

/**
 * Alertas visíveis ao usuário + contadores, com realtime.
 *
 * Padrão herdado de useAuditoriaAssim: o realtime é apenas SINAL DE
 * INVALIDAÇÃO (debounced), não fonte de dados — a cada mudança refazemos as duas
 * RPCs em vez de aplicar o payload do evento. Assim a RLS continua sendo a única
 * autoridade sobre o que o usuário vê, e o payload de replicação fica pequeno
 * (importa: este projeto tem aviso de Disk IO Budget, com realtime em ~26%).
 *
 * @param modulo  null = todos os módulos (usado pelo sino global);
 *                'assim' = só a aba Pendências.
 * @param status  'abertos' (aberto+em_andamento) por padrão.
 */
export function useAlertas(
  modulo: string | null = null,
  status: string | null = 'abertos',
) {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [contadores, setContadores] = useState<AlertasContadores>(CONTADORES_ZERO)
  const [loading, setLoading] = useState(true)

  const loadingRef  = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const montadoRef  = useRef(true)

  const carregar = useCallback(async (silent = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const [lista, cont] = await Promise.all([
        listarAlertas(modulo, status),
        buscarContadores(modulo),
      ])
      if (!montadoRef.current) return
      setAlertas(lista)
      setContadores(cont)
    } finally {
      if (montadoRef.current) setLoading(false)
      loadingRef.current = false
    }
  }, [modulo, status])

  useEffect(() => {
    montadoRef.current = true
    carregar()
    return () => { montadoRef.current = false }
  }, [carregar])

  useEffect(() => {
    const supabase = getSupabaseClient()
    let inscrito = true

    function invalidar() {
      if (!inscrito) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => carregar(true), DEBOUNCE_MS)
    }

    // Nome de canal por escopo: o sino ('all') e a aba ('assim') são instâncias
    // distintas e não podem compartilhar tópico, senão uma derruba a outra.
    const channel = supabase
      .channel(`alertas-live-${modulo ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, invalidar)
      .subscribe()

    return () => {
      inscrito = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [carregar, modulo])

  return { alertas, contadores, loading, recarregar: carregar }
}
