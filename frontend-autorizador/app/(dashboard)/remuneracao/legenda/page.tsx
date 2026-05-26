'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import LegendaTab from '@/components/remuneracao/legenda/LegendaTab'

export default function LegendaPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Legenda', 'Referência completa de modalidades e classificações') }, [])
  return <LegendaTab />
}
