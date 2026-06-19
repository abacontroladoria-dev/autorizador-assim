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
      <h3 className="text-xs font-medium text-muted-foreground flex-1">
        {title}
        {count !== undefined && (
          <span className="ml-1.5 text-muted-foreground/45 font-normal tabular-nums">{count}</span>
        )}
      </h3>
      {action}
    </div>
  )
}
