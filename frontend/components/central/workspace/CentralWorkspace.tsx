'use client'

import { useState } from 'react'
import CentralTopbar       from './CentralTopbar'
import ConversationSidebar from '../conversations/ConversationSidebar'
import ChatPane            from '../chat/ChatPane'
import ContextPanel        from '../context-panel/ContextPanel'

export default function CentralWorkspace() {
  const [contextPanelOpen, setContextPanelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen]           = useState(false)

  function openSidebar() {
    setContextPanelOpen(false)
    setSidebarOpen(true)
  }

  function toggleContextPanel() {
    if (!contextPanelOpen) setSidebarOpen(false)
    setContextPanelOpen(o => !o)
  }

  return (
    <div className="h-full flex flex-col">
      <CentralTopbar onOpenSidebar={openSidebar} />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <ConversationSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <ChatPane
          contextPanelOpen={contextPanelOpen}
          onToggleContextPanel={toggleContextPanel}
        />
        <ContextPanel
          isOpen={contextPanelOpen}
          onClose={() => setContextPanelOpen(false)}
        />
      </div>
    </div>
  )
}
