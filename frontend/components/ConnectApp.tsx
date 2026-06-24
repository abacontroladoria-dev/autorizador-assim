'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Temporary redirect to new /connect routes while migration is in progress
export default function ConnectApp() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/connect/inbox')
  }, [router])

  return null
}
