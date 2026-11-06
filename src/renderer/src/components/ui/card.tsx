import * as React from 'react'
import { cn } from '@renderer/lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: DivProps): React.JSX.Element {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface text-text shadow-sm', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: DivProps): React.JSX.Element {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h3 className={cn('text-[15px] leading-tight font-semibold', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('text-sm text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }: DivProps): React.JSX.Element {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: DivProps): React.JSX.Element {
  return <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />
}
