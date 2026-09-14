import { CircleHelp, Heart, Search, ShoppingBag, UserRound, UtensilsCrossed, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useSession } from '@/lib/session'
import { AccountMenu } from '@/components/account-menu'
import { useCart } from '@/lib/queries'
import { isDemoMode } from '@/lib/api'
import { useFavorites } from '@/lib/favorites'
import { cn } from '@/lib/utils'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="QuickBite home">
      <UtensilsCrossed size={23} aria-hidden="true" />
      <span>QuickBite</span>
    </Link>
  )
}

function Navigation() {
  const { ids } = useFavorites()
  return (
    <nav aria-label="Main navigation" className="main-nav">
      <NavLink to="/" end className={({ isActive }) => cn('nav-item', isActive && 'active')}>
        Restaurants
      </NavLink>
      <NavLink to="/saved" className={({ isActive }) => cn('nav-item', isActive && 'active')}>
        <Heart size={17} aria-hidden="true" /> Saved
        {ids.length > 0 && (
          <span className="nav-count" aria-label={ids.length + ' saved restaurants'}>
            {ids.length}
          </span>
        )}
      </NavLink>
    </nav>
  )
}

function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="help-button">
          <CircleHelp size={16} /> How it works
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to order</DialogTitle>
          <DialogDescription>Three steps to your next meal.</DialogDescription>
        </DialogHeader>
        <ol className="how-it-works">
          <li>
            <span>1</span>
            <div>
              <h3>Choose a restaurant</h3>
              <p>Browse by cuisine or search for a restaurant or dish. Save places for later.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Add your items</h3>
              <p>Sign in and choose from the menu. Each tap adds one serving to your cart.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Review and order</h3>
              <p>Check your items and total, then confirm your order at checkout.</p>
            </div>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}

export function Layout() {
  const { isAuthenticated, isSigningOut } = useSession()
  const cart = useCart(isAuthenticated && !isSigningOut)
  const count = cart.data?.order_items.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const searchQuery = new URLSearchParams(location.search).get('q') || ''
  useEffect(() => {
    setSearch(searchQuery)
    window.scrollTo({ top: 0, behavior: 'instant' })
    const title =
      location.pathname === '/'
        ? 'Restaurants'
        : location.pathname.startsWith('/restaurants/')
          ? 'Menu'
          : location.pathname.slice(1).replaceAll('-', ' ')
    document.title = title.charAt(0).toUpperCase() + title.slice(1) + ' | QuickBite'
  }, [location.pathname, searchQuery])

  function clearSearch() {
    setSearch('')
    searchInput.current?.focus()
    if (searchQuery) {
      const params = new URLSearchParams(location.search)
      params.delete('q')
      navigate(location.pathname + (params.size ? '?' + params : ''), { replace: true })
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <Navigation />
          <form
            className="header-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              navigate(search.trim() ? '/?q=' + encodeURIComponent(search.trim()) : '/')
            }}
          >
            <input
              ref={searchInput}
              type="search"
              aria-label="Search restaurants or dishes"
              placeholder="Search restaurants or dishes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={clearSearch}>
                <X size={17} />
              </button>
            )}
            <button type="submit" aria-label="Submit search">
              <Search size={19} />
            </button>
          </form>
          <div className="header-actions">
            {isDemoMode && <span className="demo-pill">Demo</span>}
            {isAuthenticated ? (
              <AccountMenu />
            ) : (
              <Button asChild variant="ghost" className="account-button">
                <Link to="/login" aria-label="Sign in">
                  <UserRound size={19} />
                  <span>Sign in</span>
                </Link>
              </Button>
            )}
            <Button asChild className="header-cart">
              <Link to="/cart" aria-label={'Your cart, ' + count + ' items'}>
                <ShoppingBag size={18} />
                <span className="cart-label">Cart</span>
                <span className="cart-count">{count}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="page-footer">
        <span>© {new Date().getFullYear()} QuickBite</span>
        <HelpDialog />
      </footer>
    </div>
  )
}
