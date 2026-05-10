'use client'

interface Props {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  actions,
}: Props) {

  return (

    <div className="
      flex items-start justify-between
      gap-4
    ">

      <div>

        <h1 className="
          text-2xl
          font-bold
          tracking-tight
          text-slate-800
        ">
          {title}
        </h1>

        {subtitle && (
          <p className="
            text-sm
            text-slate-500
            mt-1
          ">
            {subtitle}
          </p>
        )}

      </div>

      {actions && (
        <div className="
          flex items-center gap-3
          shrink-0
        ">
          {actions}
        </div>
      )}

    </div>
  )
}