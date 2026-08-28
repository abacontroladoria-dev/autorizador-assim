'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type HeaderActions = {
  setHeader: (title: string, subtitle?: string) => void
  setRightContent: (content: ReactNode) => void
}

type HeaderState = {
  title: string
  subtitle?: string
  rightContent?: ReactNode
}

// Ações e estado vivem em contextos separados de propósito. A imensa maioria
// das telas só chama setHeader/setRightContent (nunca lê title/rightContent),
// mas antes disso vinha tudo junto num contexto só — cada tecla digitada num
// campo de busca que atualiza o rightContent (ex.: PacientesCadastro) forçava
// TODA tela consumidora a re-renderizar, mesmo sem usar o valor que mudou.
// Com ações num contexto próprio e memoizadas, useHeader() nunca muda de
// referência, então só quem de fato lê o estado (o layout do dashboard) volta
// a renderizar quando title/subtitle/rightContent mudam.
const HeaderActionsContext = createContext<HeaderActions>({
  setHeader: () => {},
  setRightContent: () => {},
})

const HeaderStateContext = createContext<HeaderState>({
  title: '',
  subtitle: '',
  rightContent: null,
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

  const actions = useMemo(() => ({ setHeader, setRightContent }), [setHeader, setRightContent])
  const state = useMemo(
    () => ({ title, subtitle, rightContent }),
    [title, subtitle, rightContent]
  )

  return (
    <HeaderActionsContext.Provider value={actions}>
      <HeaderStateContext.Provider value={state}>
        {children}
      </HeaderStateContext.Provider>
    </HeaderActionsContext.Provider>
  )
}

/** Para quem só precisa DEFINIR o header — nunca re-renderiza por mudança de estado. */
export function useHeader() {
  return useContext(HeaderActionsContext)
}

/** Para quem precisa LER o estado atual (hoje só o layout do dashboard). */
export function useHeaderState() {
  return useContext(HeaderStateContext)
}
