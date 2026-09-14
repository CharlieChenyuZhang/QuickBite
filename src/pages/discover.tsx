import { useQueries } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChefHat,
  Heart,
  Leaf,
  Search,
  SlidersHorizontal,
  UtensilsCrossed,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { RestaurantCard } from '@/components/restaurant-card'
import { FoodImage } from '@/components/food-image'
import { CardsSkeleton, EmptyState, ErrorState } from '@/components/feedback'
import { useRestaurants, queryKeys } from '@/lib/queries'
import { api, isDemoMode } from '@/lib/api'
import { categories, heroImage, restaurantPresentation } from '@/lib/presentation'
import { useFavorites } from '@/lib/favorites'
import { cn } from '@/lib/utils'

export function DiscoverPage({ savedOnly = false }: { savedOnly?: boolean }) {
  const restaurants = useRestaurants()
  const { ids } = useFavorites()
  const [params, setParams] = useSearchParams()
  const search = params.get('q')?.trim().toLowerCase() || ''
  const category = params.get('category') || 'All'
  const sort = params.get('sort') || 'recommended'
  const menuQueries = useQueries({
    queries: (restaurants.data ?? []).map((restaurant) => ({
      queryKey: queryKeys.menus(restaurant.id),
      queryFn: () => api.getMenus(restaurant.id),
      enabled: !!search || category !== 'All',
      staleTime: 5 * 60_000,
    })),
  })
  const filtered = (restaurants.data ?? [])
    .filter((restaurant, index) => {
      if (savedOnly && !ids.includes(restaurant.id)) return false
      const menus = menuQueries[index]?.data ?? restaurant.menu_items
      const meta = restaurantPresentation(restaurant, menus)
      if (category !== 'All' && meta.cuisine !== category) return false
      return (
        !search ||
        `${restaurant.name} ${meta.description} ${meta.cuisine} ${(menus ?? []).map((item) => item.name).join(' ')}`
          .toLowerCase()
          .includes(search)
      )
    })
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : 0))
  function updateParam(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value && value !== 'All' && value !== 'recommended') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }
  const searchingMenus =
    (!!search || category !== 'All') && menuQueries.some((query) => query.isLoading)
  const menuSearchError =
    (!!search || category !== 'All') && menuQueries.some((query) => query.isError)
  return (
    <div className="page-content discover-page">
      {!savedOnly && !search && (
        <>
          <div className="page-intro">
            <div>
              <p className="eyebrow">A WORLD OF FLAVOR, ONE CLICK AWAY</p>
              <h1>
                Good food. Good mood<span className="text-primary">.</span>
              </h1>
              <p>Find something delicious from a place you’ll love.</p>
            </div>
            <span className="intro-stamp">
              <UtensilsCrossed size={17} /> Made for your cravings
            </span>
          </div>
          <section className="hero" aria-label="Fresh food inspiration">
            <div className="hero-copy">
              <span className="hero-eyebrow">
                <span /> FRESH FINDS, HAPPY TASTEBUDS
              </span>
              <h2>
                Your next
                <br />
                favorite bite
                <br />
                <span>is right here.</span>
              </h2>
              <p>
                From colorful bowls to comfort classics.
                <br />
                Good food for whatever you’re craving.
              </p>
              <Button size="lg" asChild>
                <a href="#restaurants">
                  Find my next bite <ArrowUpRight size={17} />
                </a>
              </Button>
              <div className="hero-footnote">
                <Leaf size={14} /> A little fresh. A lot of delicious.
              </div>
            </div>
            <div className="hero-photo">
              <FoodImage
                src={heroImage}
                alt="A colorful bowl of fresh greens, vegetables and nourishing ingredients"
                eager
              />
              <span className="hero-photo-overlay" />
              <div className="hero-floating-card">
                <span className="floating-icon">
                  <Leaf size={20} />
                </span>
                <div>
                  <strong>Fresh looks good on you.</strong>
                  <span>Meet your feel-good favorites</span>
                </div>
                <ArrowUpRight size={20} />
              </div>
            </div>
            <div className="hero-sparkle" aria-hidden="true">
              ✳
            </div>
          </section>
        </>
      )}
      {(savedOnly || search) && (
        <div className="page-intro">
          <div>
            <p className="eyebrow">{savedOnly ? 'KEEP THE GOOD ONES CLOSE' : 'FIND YOUR FLAVOR'}</p>
            <h1>{savedOnly ? 'Your saved places' : `A bite of “${params.get('q')}”`}</h1>
            <p>
              {savedOnly
                ? 'Your favorites, all in one delicious little collection.'
                : 'Restaurants and dishes that match your craving.'}
            </p>
          </div>
          {savedOnly && <Heart className="text-primary" size={32} strokeWidth={1.5} />}
        </div>
      )}
      <section className="cuisine-section" aria-label="Browse by cuisine">
        <div className="section-heading">
          <h2>What sounds good?</h2>
          <span>A flavor for every mood</span>
        </div>
        <div className="category-list">
          {categories.map((item) => (
            <button
              key={item.name}
              className={cn('category-button', category === item.name && 'selected')}
              aria-pressed={category === item.name}
              onClick={() => updateParam('category', item.name)}
            >
              <span aria-hidden="true" className="category-emoji">
                {item.icon}
              </span>
              <span>{item.name === 'All' ? 'All cuisines' : item.name}</span>
              {category === item.name && <span className="category-dot" />}
            </button>
          ))}
        </div>
      </section>
      <section
        id="restaurants"
        className="restaurant-section"
        aria-label={savedOnly ? 'Saved restaurants' : 'Restaurants'}
      >
        <div className="section-heading restaurants-heading">
          <div>
            <h2>
              {savedOnly
                ? 'Worth coming back for'
                : search
                  ? 'Here’s what we found'
                  : 'Discover your next favorite'}
            </h2>
            <p>
              {restaurants.isSuccess
                ? `${filtered.length} ${filtered.length === 1 ? 'restaurant' : 'restaurants'}${isDemoMode ? ' to explore in this demo' : ' to explore'}${searchingMenus ? ' · Searching menus…' : ''}`
                : 'Good things are on the menu'}
            </p>
          </div>
          <label className="sort-control">
            <SlidersHorizontal size={15} />
            <span className="sr-only">Sort restaurants</span>
            <select value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
              <option value="recommended">Recommended</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        {menuSearchError && (
          <p role="status" className="search-note">
            Some menus couldn’t be searched. Restaurant matches are shown.{' '}
            <button
              onClick={() => {
                menuQueries
                  .filter((query) => query.isError)
                  .forEach((query) => {
                    void query.refetch()
                  })
              }}
            >
              Retry menu search
            </button>
          </p>
        )}
        {restaurants.isLoading ? (
          <CardsSkeleton />
        ) : restaurants.isError ? (
          <ErrorState
            error={restaurants.error}
            retry={() => {
              void restaurants.refetch()
            }}
          />
        ) : !filtered.length && !searchingMenus ? (
          <EmptyState
            title={
              savedOnly && !ids.length
                ? 'Your next favorite is out there'
                : 'No bites found just yet'
            }
            description={
              savedOnly && !ids.length
                ? 'Tap the heart on a restaurant to save it for later.'
                : 'Try another dish, restaurant name, or cuisine.'
            }
            action={
              <Button
                variant="outline"
                onClick={() => {
                  if (savedOnly && !ids.length) window.location.assign('/')
                  else setParams({})
                }}
              >
                {savedOnly && !ids.length ? 'Discover restaurants' : 'Clear filters'}{' '}
                <ArrowRight size={16} />
              </Button>
            }
          />
        ) : (
          <div className="restaurant-grid">
            {filtered.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                menus={menuQueries[(restaurants.data ?? []).indexOf(restaurant)]?.data}
              />
            ))}
          </div>
        )}
        {searchingMenus && !filtered.length && <CardsSkeleton />}
      </section>
      {!savedOnly && !search && (
        <section className="discovery-banner">
          <span className="banner-icon">
            <ChefHat size={31} strokeWidth={1.4} />
          </span>
          <div>
            <p className="eyebrow">FOLLOW YOUR APPETITE</p>
            <h2>A new favorite is always on the menu.</h2>
            <p>The best part of your day might just be your next meal.</p>
          </div>
          <a href="#restaurants" aria-label="Explore restaurants">
            <ArrowDown size={24} />
          </a>
        </section>
      )}
      {search && (
        <p className="search-tip">
          <Search size={15} /> Tip: search a dish like “pizza” or a restaurant name.
        </p>
      )}
    </div>
  )
}
