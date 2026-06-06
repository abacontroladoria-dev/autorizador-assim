'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react'

type HeaderContextType = {
  title: string
  subtitle?: string

  setHeader: (
    title: string,
    subtitle?: string
  ) => void
}

const HeaderContext =
  createContext<HeaderContextType>({
    title: '',
    subtitle: '',
    setHeader: () => {},
  })

export function HeaderProvider({
  children,
}: {
  children: React.ReactNode
}) {

  const [title, setTitle] =
    useState('')

  const [subtitle, setSubtitle] =
    useState('')

  const setHeader = useCallback((newTitle: string, newSubtitle?: string) => {
    setTitle(newTitle)
    setSubtitle(newSubtitle || '')
  }, [])

  return (
    <HeaderContext.Provider
      value={{
        title,
        subtitle,
        setHeader,
      }}
    >
      {children}
    </HeaderContext.Provider>
  )
}

export function useHeader() {
  return useContext(HeaderContext)
}