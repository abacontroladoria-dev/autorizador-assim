'use client'

import ContactCard          from './ContactCard'
import PatientLinksCard     from './PatientLinksCard'
import ConversationMetaCard from './ConversationMetaCard'
import InternalNotesCard    from './InternalNotesCard'

interface Props {
  isOpen: boolean
}

export default function ContextPanel({ isOpen }: Props) {
  return (
    <aside
      style={{ backgroundColor: 'oklch(0.975 0.005 232)' }}
      className={`shrink-0 flex flex-col border-l border-border overflow-hidden transition-[width] duration-300 ease-in-out ${
        isOpen ? 'w-[360px]' : 'w-0'
      }`}
    >
      {/* Inner wrapper fixed at 360px — prevents content reflow during animation */}
      <div className="w-[360px] flex flex-col h-full overflow-y-auto">
        <ContactCard />
        <PatientLinksCard />
        <ConversationMetaCard />
        <InternalNotesCard />
      </div>
    </aside>
  )
}
