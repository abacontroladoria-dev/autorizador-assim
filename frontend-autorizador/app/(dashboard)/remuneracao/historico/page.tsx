'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import HistoricoTab from '@/components/remuneracao/historico/HistoricoTab'

export default function HistoricoPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Histórico', 'Snapshots mensais e evolução ao longo do tempo') }, [])
  return <HistoricoTab />
}
