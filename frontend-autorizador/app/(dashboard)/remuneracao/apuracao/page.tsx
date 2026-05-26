'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import ApuracaoTab from '@/components/remuneracao/apuracao/ApuracaoTab'

export default function ApuracaoPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Apuração Real (RP)', 'Classificação e cálculo por evolução registrada') }, [])
  return <ApuracaoTab />
}
