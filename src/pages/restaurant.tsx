import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Leaf,
  LoaderCircle,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodImage } from '@/components/food-image'
import { CardsSkeleton, EmptyState, ErrorState } from '@/components/feedback'
import { queryKeys, useAddToCart, useCart, useMenus, useRestaurants } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { useFavorites } from '@/lib/favorites'
import { errorMessage, money, restaurantPresentation } from '@/lib/presentation'
import type { MenuItem } from '@/lib/types'
import { ApiError } from '@/lib/api'

export function RestaurantPage() {
  const { id } = useParams()
  const restaurantId = Number(id)
  const restaurants = useRestaurants()
  const menu = useMenus(restaurantId)
  const restaurant = restaurants.data?.find((item) => item.id === restaurantId)
  const { ids, toggle } = useFavorites()
  const { isAuthenticated, isSigningOut, sessionId } = useSession()
  const client = useQueryClient()
  const cart = useCart(isAuthenticated && !isSigningOut)
  const add = useAddToCart()
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<number | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  async function addItem(item: MenuItem) {
    if (isSigningOut) return
    const requestSessionId = sessionId
    const isCurrentSession = () =>
      client.getQueryData<{ sessionId: string }>(queryKeys.session)?.sessionId === requestSessionId
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    setAddingId(item.id)
    try {
      await add.mutateAsync(item.id)
      if (!isCurrentSession()) return
      toast.success(`${item.name} added to your cart`, {
        action: { label: 'View cart', onClick: () => navigate('/cart') },
      })
    } catch (error) {
      const activeSession = client.getQueryData(queryKeys.session)
      if (
        !isCurrentSession() &&
        !(error instanceof ApiError && error.status === 401 && activeSession === null)
      )
        return
      toast.error(errorMessage(error))
      if (error instanceof ApiError && error.status === 401)
        navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    } finally {
      setAddingId(null)
    }
  }
  if (restaurants.isLoading)
    return (
      <div className="page-content">
        <CardsSkeleton />
      </div>
    )
  if (restaurants.isError)
    return (
      <div className="page-content">
        <ErrorState
          error={restaurants.error}
          retry={() => {
            void restaurants.refetch()
          }}
        />
      </div>
    )
  if (!restaurant)
    return (
      <div className="page-content">
        <EmptyState
          title="This restaurant isn’t on the menu"
          description="Explore our other restaurants to find something delicious."
          action={
            <Button asChild>
              <Link to="/">Discover restaurants</Link>
            </Button>
          }
        />
      </div>
    )
  const meta = restaurantPresentation(restaurant, menu.data)
  const items = (menu.data ?? []).filter((item) =>
    `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.toLowerCase().trim()),
  )
  return (
    <div className="page-content menu-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> All restaurants
      </Link>
      <section className="restaurant-cover">
        <FoodImage src={meta.image} alt={restaurant.name} eager />
        <div className="cover-shade" />
        <div className="cover-copy">
          <span className="cover-category">
            {meta.cuisine === 'All'
              ? 'GOOD FOOD STARTS HERE'
              : `${meta.cuisine.toUpperCase()} · MADE WITH CARE`}
          </span>
          <h1>{restaurant.name}</h1>
          <p>{meta.description}</p>
        </div>
        <Button
          size="icon"
          className="cover-save"
          variant="secondary"
          aria-label={`${ids.includes(restaurant.id) ? 'Unsave' : 'Save'} ${restaurant.name}`}
          aria-pressed={ids.includes(restaurant.id)}
          onClick={() => toggle(restaurant.id)}
        >
          <Heart size={20} className={ids.includes(restaurant.id) ? 'fill-primary' : ''} />
        </Button>
      </section>
      <div className="menu-toolbar">
        <div>
          <p className="eyebrow">FIND YOUR NEW GO-TO</p>
          <h2>Made to make your day</h2>
          <p>{menu.data?.length ?? 0} dishes, plenty to love.</p>
        </div>
        <div className="menu-search">
          <Search size={17} />
          <Input
            aria-label="Search this menu"
            placeholder="Search this menu"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {menu.isLoading ? (
        <CardsSkeleton />
      ) : menu.isError ? (
        <ErrorState
          error={menu.error}
          retry={() => {
            void menu.refetch()
          }}
        />
      ) : !items.length ? (
        <EmptyState
          title={search ? 'No dishes match that craving' : 'The menu is getting ready'}
          description={
            search
              ? 'Try a different search to find your next bite.'
              : 'Check back soon for something delicious.'
          }
          action={
            search && (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            )
          }
        />
      ) : (
        <div className="menu-grid">
          {items.map((item) => (
            <article className="menu-item" key={item.id}>
              <div className="menu-item-photo">
                <FoodImage src={item.image_url} alt={item.name} />
              </div>
              <div className="menu-item-body">
                <h3>{item.name}</h3>
                <p>{item.description || 'Prepared with care, ready for your next craving.'}</p>
                <div className="menu-item-bottom">
                  <strong>{money(item.price)}</strong>
                  <Button
                    size="icon"
                    className="add-button"
                    aria-label={`Add ${item.name} to cart`}
                    disabled={add.isPending || isSigningOut}
                    onClick={() => {
                      void addItem(item)
                    }}
                  >
                    {addingId === item.id ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Plus size={19} />
                    )}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="menu-note">
        <Leaf size={15} /> Have a food allergy? Please contact the restaurant before ordering.
        {restaurant.phone && <a href={`tel:${restaurant.phone}`}>{restaurant.phone}</a>}
      </p>
      {!!cart.data?.order_items.length && (
        <div className="floating-cart">
          <span>
            <ShoppingBag size={20} /> Your next great meal is taking shape.
          </span>
          <Button asChild>
            <Link to="/cart">
              View cart · {money(cart.data.total_price)} <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
