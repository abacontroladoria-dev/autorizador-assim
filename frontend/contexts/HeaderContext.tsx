'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type HeaderContextType = {
  title: string
  subtitle?: string
  rightContent?: ReactNode

  setHeader: (title: string, subtitle?: string) => void
  setRightContent: (content: ReactNode) => void
}

const HeaderContext = createContext<HeaderContextType>({
  title: '',
  subtitle: '',
  rightContent: null,
  setHeader: () => {},
  setRightContent: () => {},
})

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [rightContent, setRightContentState] = useState<ReactNode>(null)

  const setHeader = useCallback((newTitle: string, newSubtitle?: string) => {
    setTitle(newTitle)
    setSubtitle(newSubtitle || '')
  }, [])

  const setRightContent = useCallback((content: ReactNode) => {
    setRightContentState(content)
  }, [])

  return (
    <HeaderContext.Provider value={{ title, subtitle, rightContent, setHeader, setRightContent }}>
      {children}
    </HeaderContext.Provider>
  )
}

export function useHeader() {
  return useContext(HeaderContext)
}
