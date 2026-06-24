import React from 'react'

export const Textarea = React.forwardRef<HTMLTextAreaElement, any>(
  ({ ...props }, ref) => <textarea ref={ref} {...props} />
)
Textarea.displayName = 'Textarea'
