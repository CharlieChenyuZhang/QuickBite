import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback'
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.isLoading)
    return (
      <div className="page-content" role="status" aria-label="Checking your session">
        <Skeleton className="mb-5 h-12 w-60" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )
  if (session.error && !session.isAuthenticated)
    return (
      <div className="page-content">
        <ErrorState error={session.error} retry={() => window.location.reload()} />
      </div>
    )
  return session.isAuthenticated ? (
    children
  ) : (
    <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  )
}
