import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Leaf,
  LoaderCircle,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
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
          <span className="cart-item-icon">
            <UtensilIcon />
          </span>
          <div>
            <h3>{item.menu_item_name}</h3>
            <p>{item.quantity && item.quantity > 1 ? `${item.quantity} servings` : '1 serving'}</p>
          </div>
          <strong>{money(item.price)}</strong>
        </li>
      ))}
    </ul>
  )
}
function UtensilIcon() {
  return <ShoppingBag size={22} strokeWidth={1.5} />
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
            <p className="eyebrow">ROOM FOR SOMETHING DELICIOUS</p>
            <h1>Your cart</h1>
          </div>
        </div>
        <EmptyState
          cart
          title="A little empty. A lot of possibilities."
          description="Find something you love and add it to your cart. Your next great meal starts here."
          action={
            <Button asChild size="lg">
              <Link to="/">
                Find my next bite <ArrowRight size={17} />
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
        {checkout ? 'Back to your cart' : 'Keep exploring'}
      </Link>
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {checkout ? 'THE GOOD PART IS ALMOST HERE' : 'YOU HAVE EXCELLENT TASTE'}
          </p>
          <h1>{checkout ? 'One last look.' : 'Your next great meal.'}</h1>
          <p>
            {checkout
              ? 'Review your meal and confirm your order.'
              : `${count} ${count === 1 ? 'delicious choice' : 'delicious choices'}, all in one place.`}
          </p>
        </div>
        <div className="checkout-steps">
          <span className="active">{checkout ? <Check size={14} /> : '1'}</span> Cart <i />
          <span className={checkout ? 'active' : ''}>2</span> Checkout
        </div>
      </div>
      <div className="checkout-layout">
        <section className="cart-panel">
          <div className="cart-panel-heading">
            <h2>
              <ShoppingBag size={20} />
              {checkout ? 'Your order' : 'In your bag'}
            </h2>
            <span>{count} items</span>
          </div>
          <CartLines cart={data} />
          <div className="cart-notice">
            <Leaf size={16} />
            <p>
              Every good meal starts with a little care. Check your selections before placing your
              order.
            </p>
          </div>
          <p className="cart-support-note">
            Items can be added from the menu. To change an item already in your cart, please contact
            the restaurant.
          </p>
        </section>
        <aside className="order-summary">
          <p className="eyebrow">THE DELICIOUS DETAILS</p>
          <h2>Order summary</h2>
          <div className="summary-line">
            <span>Items</span>
            <span>{count}</span>
          </div>
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
                {order.isPending ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <CheckCircle2 size={17} />
                )}{' '}
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
          <p className="summary-security">
            <ShieldCheck size={15} />{' '}
            {checkout ? 'Confirm only when you’re ready' : 'A few clicks from a good meal'}
          </p>
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
          title="Your next good meal is waiting"
          description="Place an order and your confirmation will appear here."
          action={
            <Button asChild>
              <Link to="/">Explore restaurants</Link>
            </Button>
          }
        />
      </div>
    )
  return (
    <div className="page-content confirmation-page">
      <div className="confirmation-mark">
        <Check size={37} />
      </div>
      <p className="eyebrow">GOOD CHOICE. GREAT TASTE.</p>
      <h1>Order confirmed!</h1>
      <p>Your order has been submitted successfully. Thanks for choosing QuickBite.</p>
      {isDemoMode && (
        <p className="confirmation-demo">Demo order only. No real purchase or delivery.</p>
      )}
      <section className="receipt">
        <div className="cart-panel-heading">
          <h2>
            <ClipboardList size={20} /> Your meal, at a glance
          </h2>
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
          Find your next favorite <ArrowRight size={17} />
        </Link>
      </Button>
      <p className="confirmation-footer">
        Thanks for bringing your appetite. <Leaf size={14} />
      </p>
    </div>
  )
}
