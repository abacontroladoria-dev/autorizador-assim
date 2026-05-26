'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import ConfigTab from '@/components/remuneracao/config/ConfigTab'

export default function ConfigPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Configurações', 'Taxas, contratos, feriados e parâmetros globais') }, [])
  return <ConfigTab />
}
