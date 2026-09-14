import { useState } from 'react'
import { Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'
export function FoodImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src?: string
  alt: string
  className?: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return src && !failed ? (
    <img
      className={cn('h-full w-full object-cover', className)}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center bg-secondary text-primary',
        className,
      )}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <Utensils size={38} strokeWidth={1.25} />
    </div>
  )
}
