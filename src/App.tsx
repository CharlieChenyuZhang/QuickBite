import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { CardsSkeleton, EmptyState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { DiscoverPage } from '@/pages/discover'
import { ProtectedRoute } from '@/components/protected-route'
const RestaurantPage = lazy(() =>
  import('@/pages/restaurant').then((module) => ({ default: module.RestaurantPage })),
)
const AuthPage = lazy(() => import('@/pages/auth').then((module) => ({ default: module.AuthPage })))
const CartPage = lazy(() => import('@/pages/cart').then((module) => ({ default: module.CartPage })))
const ConfirmationPage = lazy(() =>
  import('@/pages/cart').then((module) => ({ default: module.ConfirmationPage })),
)
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="page-content">
          <CardsSkeleton />
        </div>
      }
    >
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DiscoverPage />} />
          <Route path="saved" element={<DiscoverPage savedOnly />} />
          <Route path="restaurants/:id" element={<RestaurantPage />} />
          <Route path="login" element={<AuthPage key="login" />} />
          <Route path="signup" element={<AuthPage signup key="signup" />} />
          <Route
            path="cart"
            element={
              <ProtectedRoute>
                <CartPage key="cart" />
              </ProtectedRoute>
            }
          />
          <Route
            path="checkout"
            element={
              <ProtectedRoute>
                <CartPage checkout key="checkout" />
              </ProtectedRoute>
            }
          />
          <Route
            path="order-confirmation"
            element={
              <ProtectedRoute>
                <ConfirmationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <div className="page-content">
                <EmptyState
                  title="This page went out for a bite"
                  description="Let’s get you back to something delicious."
                  action={
                    <Button asChild>
                      <Link to="/">Back to discovering</Link>
                    </Button>
                  }
                />
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}
