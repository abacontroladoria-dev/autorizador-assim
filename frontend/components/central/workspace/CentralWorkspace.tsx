'use client'

import { useState } from 'react'
import CentralTopbar       from './CentralTopbar'
import ConversationSidebar from '../conversations/ConversationSidebar'
import ChatPane            from '../chat/ChatPane'
import ContextPanel        from '../context-panel/ContextPanel'

export default function CentralWorkspace() {
  const [contextPanelOpen, setContextPanelOpen] = useState(false)

  return (
    <div className="h-full flex flex-col">
      <CentralTopbar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <ConversationSidebar />
        <ChatPane
          contextPanelOpen={contextPanelOpen}
          onToggleContextPanel={() => setContextPanelOpen(o => !o)}
        />
        <ContextPanel isOpen={contextPanelOpen} />
      </div>
    </div>
  )
}
