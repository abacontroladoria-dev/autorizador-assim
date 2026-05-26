'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import AnaliseTab from '@/components/remuneracao/analise/AnaliseTab'

export default function AnalisePage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Análise Futura', 'Projeção mensal de remuneração por profissional') }, [])
  return <AnaliseTab />
}
