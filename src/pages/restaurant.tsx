import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Heart, LoaderCircle, Plus, Search } from 'lucide-react'
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
          title="Restaurant not found"
          description="Choose another restaurant to view its menu."
          action={
            <Button asChild>
              <Link to="/">Browse restaurants</Link>
            </Button>
          }
        />
      </div>
    )
  const meta = restaurantPresentation(restaurant, menu.data)
  const items = (menu.data ?? []).filter((item) =>
    `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.toLowerCase().trim()),
  )
  const cartCount = cart.data?.order_items.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 0
  return (
    <div className="page-content menu-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> All restaurants
      </Link>
      <section className="restaurant-cover">
        {meta.image && (
          <div className="restaurant-cover-photo">
            <FoodImage src={meta.image} alt={restaurant.name} eager />
          </div>
        )}
        <div className="cover-copy">
          {meta.cuisine !== 'All' && <p className="cover-category">{meta.cuisine}</p>}
          <h1>{restaurant.name}</h1>
          {restaurant.address && <p>{restaurant.address}</p>}
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
          <h2>Menu</h2>
          <p>{menu.data?.length ?? 0} dishes</p>
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
          title={search ? 'No matching dishes' : 'No menu items available'}
          description={
            search
              ? 'Try a different search.'
              : 'This restaurant has no menu items available right now.'
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
              <div className="menu-item-body">
                <h3>{item.name}</h3>
                {item.description && <p>{item.description}</p>}
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
              {item.image_url && (
                <div className="menu-item-photo">
                  <FoodImage src={item.image_url} alt={item.name} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="menu-note">
        Have a food allergy? Contact the restaurant before ordering.
        {restaurant.phone && <a href={`tel:${restaurant.phone}`}>{restaurant.phone}</a>}
      </p>
      {!!cart.data?.order_items.length && (
        <div className="floating-cart">
          <span>
            {cartCount} {cartCount === 1 ? 'item' : 'items'} · {money(cart.data.total_price)}
          </span>
          <Button asChild>
            <Link to="/cart">
              View cart <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
