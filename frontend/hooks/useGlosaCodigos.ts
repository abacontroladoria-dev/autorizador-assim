'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

/**
 * De-para código de glosa → motivo por extenso.
 *
 * Existe porque o relatório da ASSIM trunca o texto em 25 caracteres
 * ("1013-CADASTRO DO BENEFICI"), e é de lá que vem o `status_assim` da maioria
 * das linhas da fila. A auditoria resolve isso no banco (a RPC já devolve
 * `descricao_erro` completa); a Central lê a coluna crua da view, então resolve
 * aqui.
 *
 * Cache de módulo, não estado por componente: é vocabulário — seis linhas que
 * mudam quando um código novo aparece pela primeira vez. Buscar isso a cada
 * seleção de paciente seria uma ida ao banco por clique.
 */
let cache: Map<string, string> | null = null
let emVoo: Promise<Map<string, string>> | null = null

async function carregar(): Promise<Map<string, string>> {
  if (cache) return cache
  if (!emVoo) {
    emVoo = (async () => {
      const { data, error } = await getSupabaseClient()
        .from('glosa_codigos')
        .select('codigo, descricao')

      const mapa = new Map<string, string>()
      if (error) {
        // Degrada para o texto cru da linha, que é o que a tela mostrava antes
        // deste de-para existir. Não vale derrubar a ficha por causa disso.
        console.error('Erro ao carregar códigos de glosa:', error.message)
      } else {
        for (const linha of data ?? []) mapa.set(linha.codigo, linha.descricao)
      }
      cache = mapa
      return mapa
    })()
  }
  return emVoo
}

export function useGlosaCodigos(): Map<string, string> {
  const [mapa, setMapa] = useState<Map<string, string>>(() => cache ?? new Map())

  useEffect(() => {
    let vivo = true
    carregar().then((m) => {
      if (vivo) setMapa(m)
    })
    return () => {
      vivo = false
    }
  }, [])

  return mapa
}
