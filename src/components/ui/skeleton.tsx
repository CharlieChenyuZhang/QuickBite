import { cn } from 'cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('rounded-xl bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}

export { Skeleton }
