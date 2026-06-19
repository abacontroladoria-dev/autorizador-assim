import type { LucideIcon } from 'lucide-react'

interface Props {
  icon:    LucideIcon
  title:   string
  count?:  number
  action?: React.ReactNode
}

export default function SectionHeader({ icon: Icon, title, count, action }: Props) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-3.5 text-muted-foreground" />
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
        {title}
        {count !== undefined && (
          <span className="ml-1.5 text-muted-foreground/40">{count}</span>
        )}
      </h3>
      {action}
    </div>
  )
}
