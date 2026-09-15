import { AlertCircle, ArrowRight, SearchX, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { errorMessage } from '@/lib/presentation'
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const unauthenticated = error instanceof ApiError && error.status === 401
  return (
    <div role="alert" className="feedback-panel">
      <span className="feedback-icon">
        <AlertCircle />
      </span>
      <h2>{unauthenticated ? 'Sign in to keep exploring' : 'We couldn’t load this just yet'}</h2>
      <p>{errorMessage(error)}</p>
      {unauthenticated ? (
        <Button asChild>
          <Link to="/login">
            Sign in <ArrowRight size={16} />
          </Link>
        </Button>
      ) : (
        retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )
      )}
    </div>
  )
}
export function EmptyState({
  title,
  description,
  action,
  cart = false,
}: {
  title: string
  description: string
  action?: React.ReactNode
  cart?: boolean
}) {
  return (
    <div className="feedback-panel">
      <span className="feedback-icon">{cart ? <ShoppingBag /> : <SearchX />}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function CardsSkeleton() {
  return (
    <div className="restaurant-grid" aria-label="Loading restaurants" role="status">
      {[1, 2, 3].map((id) => (
        <div key={id}>
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="mt-5 h-6 w-2/3" />
          <Skeleton className="mt-3 h-4 w-4/5" />
        </div>
      ))}
    </div>
  )
}
