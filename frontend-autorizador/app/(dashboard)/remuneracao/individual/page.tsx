'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import IndividualTab from '@/components/remuneracao/individual/IndividualTab'

export default function IndividualPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Remuneração Individual', 'Visão por profissional com exportação PDF') }, [])
  return <IndividualTab />
}
