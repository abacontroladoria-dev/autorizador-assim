'use client'

import { useEffect } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import PsicologosTab from '@/components/remuneracao/psicologos/PsicologosTab'

export default function PsicologosPage() {
  const { setHeader } = useHeader()
  useEffect(() => { setHeader('Psicólogos Analistas', 'Portfólio de pacientes e cálculo PME') }, [])
  return <PsicologosTab />
}
