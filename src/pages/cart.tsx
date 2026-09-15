import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/feedback'
import { queryKeys, useCart, useCheckout } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { errorMessage, money } from '@/lib/presentation'
import { isDemoMode } from '@/lib/api'
import type { Cart } from '@/lib/types'

function CartLines({ cart, compact = false }: { cart: Cart; compact?: boolean }) {
  return (
    <ul className={compact ? 'cart-lines compact' : 'cart-lines'}>
      {cart.order_items.map((item, index) => (
        <li key={item.id ?? `${item.menu_item_name}-${index}`}>
          <span className="cart-item-quantity" aria-label={`Quantity ${item.quantity ?? 1}`}>
            {item.quantity ?? 1}
          </span>
          <div>
            <h3>{item.menu_item_name}</h3>
          </div>
          <strong>{money(item.price)}</strong>
        </li>
      ))}
    </ul>
  )
}
export function CartPage({ checkout = false }: { checkout?: boolean }) {
  const session = useSession()
  const cart = useCart(session.isAuthenticated && !session.isSigningOut)
  const order = useCheckout()
  const client = useQueryClient()
  const navigate = useNavigate()
  const submitting = useRef(false)
  const [submitError, setSubmitError] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  async function placeOrder() {
    if (!cart.data?.order_items.length || submitting.current || needsReview || session.isSigningOut)
      return
    const requestSessionId = session.sessionId
    const isCurrentSession = () =>
      client.getQueryData<{ sessionId: string }>(queryKeys.session)?.sessionId === requestSessionId
    submitting.current = true
    setSubmitError('')
    const receipt = structuredClone(cart.data)
    try {
      await order.mutateAsync()
      if (!isCurrentSession()) return
      navigate('/order-confirmation', {
        replace: true,
        state: { receipt, placedAt: new Date().toISOString(), sessionId: requestSessionId },
      })
    } catch (error) {
      if (!isCurrentSession()) return
      setSubmitError(errorMessage(error))
      setNeedsReview(true)
    } finally {
      submitting.current = false
    }
  }
  if (cart.isLoading)
    return (
      <div className="page-content" role="status" aria-label="Loading your cart">
        <Skeleton className="mb-5 h-12 w-60" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  if (cart.isError)
    return (
      <div className="page-content">
        <ErrorState
          error={cart.error}
          retry={() => {
            void cart.refetch()
          }}
        />
      </div>
    )
  if (!cart.data?.order_items.length)
    return (
      <div className="page-content">
        <div className="page-intro">
          <div>
            <h1>{checkout ? 'Checkout' : 'Your cart'}</h1>
          </div>
        </div>
        <EmptyState
          cart
          title="Your cart is empty"
          description="Browse a restaurant menu and add items to get started."
          action={
            <Button asChild size="lg">
              <Link to="/">
                Browse restaurants <ArrowRight size={17} />
              </Link>
            </Button>
          }
        />
      </div>
    )
  const data = cart.data
  const count = data.order_items.reduce((sum, item) => sum + (item.quantity ?? 1), 0)
  return (
    <div className="page-content cart-page">
      <Link to={checkout ? '/cart' : '/'} className="back-link">
        <ArrowLeft size={16} />
        {checkout ? 'Back to your cart' : 'Browse restaurants'}
      </Link>
      <div className="page-intro">
        <div>
          <h1>{checkout ? 'Checkout' : 'Your cart'}</h1>
          {checkout && <p>Review your items before placing the order.</p>}
        </div>
      </div>
      <div className="checkout-layout">
        <section className="cart-panel">
          <div className="cart-panel-heading">
            <h2>{checkout ? 'Order details' : 'Items'}</h2>
            <span>
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          </div>
          <CartLines cart={data} />
          <p className="cart-support-note">
            To change an item already in your cart, contact the restaurant.
          </p>
        </section>
        <aside className="order-summary">
          <h2>Order summary</h2>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(data.total_price)}</strong>
          </div>
          <p className="summary-caption">
            {isDemoMode
              ? 'Demo total. No payment will be collected.'
              : 'Total provided by the restaurant.'}
          </p>
          {submitError && (
            <div role="alert" className="form-error">
              <p>{submitError}</p>
              <p className="mt-2">
                Your order may have been received. Review your cart before trying again.
              </p>
            </div>
          )}
          {checkout ? (
            needsReview ? (
              <Button asChild size="lg" className="w-full">
                <Link
                  to="/cart"
                  onClick={() => {
                    void cart.refetch()
                  }}
                >
                  Review cart <ArrowRight size={17} />
                </Link>
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full"
                disabled={order.isPending || cart.isFetching || session.isSigningOut}
                onClick={() => {
                  void placeOrder()
                }}
              >
                {order.isPending && <LoaderCircle className="animate-spin" size={17} />}{' '}
                {order.isPending ? 'Placing your order…' : 'Place order'}
              </Button>
            )
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link to="/checkout">
                Checkout <ArrowRight size={17} />
              </Link>
            </Button>
          )}
          {checkout && (
            <p className="checkout-disclosure">
              {isDemoMode
                ? 'This is a sample order for exploring QuickBite.'
                : 'QuickBite submits your order. No payment details are collected here.'}
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
export function ConfirmationPage() {
  const location = useLocation()
  const session = useSession()
  const state = location.state as { receipt?: Cart; placedAt?: string; sessionId?: string } | null
  if (!state?.receipt || !session.sessionId || state.sessionId !== session.sessionId)
    return (
      <div className="page-content">
        <EmptyState
          title="Order confirmation unavailable"
          description="Place an order to view its confirmation."
          action={
            <Button asChild>
              <Link to="/">Browse restaurants</Link>
            </Button>
          }
        />
      </div>
    )
  return (
    <div className="page-content confirmation-page">
      <div className="confirmation-mark">
        <Check size={24} />
      </div>
      <h1>Order confirmed!</h1>
      <p>Your order has been submitted.</p>
      {isDemoMode && (
        <p className="confirmation-demo">Demo order only. No real purchase or delivery.</p>
      )}
      <section className="receipt">
        <div className="cart-panel-heading">
          <h2>Order details</h2>
        </div>
        <CartLines cart={state.receipt} compact />
        <div className="summary-total">
          <span>Order total</span>
          <strong>{money(state.receipt.total_price)}</strong>
        </div>
        <p className="receipt-note">
          {state.placedAt &&
            new Date(state.placedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
        </p>
      </section>
      <Button asChild size="lg">
        <Link to="/">
          Browse restaurants <ArrowRight size={17} />
        </Link>
      </Button>
    </div>
  )
}
