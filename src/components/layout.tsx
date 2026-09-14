import {
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Compass,
  Heart,
  Leaf,
  Menu,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
      <span className="brand-icon">
        <UtensilsCrossed size={23} />
      </span>
      <span>
        Quick<span className="text-primary">Bite</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  )
}
const navigation = [
  { to: '/', label: 'Discover', icon: Compass },
  { to: '/saved', label: 'Saved places', icon: Heart },
  { to: '/cart', label: 'Your cart', icon: ShoppingBag },
]
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { ids } = useFavorites()
  return (
    <nav aria-label="Main navigation" className="main-nav">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavigate}
          className={({ isActive }) => cn('nav-item', isActive && 'active')}
        >
          <Icon size={20} />
          <span>{label}</span>
          {to === '/saved' && ids.length > 0 && <span className="nav-count">{ids.length}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="help-button">
          <CircleHelp size={19} /> How it works <ArrowUpRight size={15} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>A good meal is a few clicks away</DialogTitle>
          <DialogDescription>Here’s how to order with QuickBite.</DialogDescription>
        </DialogHeader>
        <ol className="how-it-works">
          <li>
            <span>1</span>
            <div>
              <h3>Find your flavor</h3>
              <p>Browse restaurants or search for a dish. Save places you’d like to try.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Make it a meal</h3>
              <p>Sign in and add your favorites to your cart. Each tap adds one serving.</p>
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
  const [open, setOpen] = useState(false)
  const searchQuery = new URLSearchParams(location.search).get('q') || ''
  useEffect(() => {
    setSearch(searchQuery)
    window.scrollTo({ top: 0, behavior: 'instant' })
    const title =
      location.pathname === '/'
        ? 'Discover'
        : location.pathname.startsWith('/restaurants/')
          ? 'Menu'
          : location.pathname.slice(1).replaceAll('-', ' ')
    document.title = `${title.charAt(0).toUpperCase() + title.slice(1)} | QuickBite`
  }, [location.pathname, searchQuery])
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Brand />
        <p className="sidebar-eyebrow">YOUR DAILY DOSE OF DELICIOUS</p>
        <Navigation />
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-art">
              <Leaf size={31} />
              <Sparkles size={17} />
            </span>
            <h3>
              Good food.
              <br />
              Better days.
            </h3>
            <p>
              A little something delicious
              <br />
              is always a good idea.
            </p>
            <Link to="/?category=Healthy">
              Find your fresh favorites <ArrowUpRight size={14} />
            </Link>
          </div>
          <HelpDialog />
          <div className="sidebar-copyright">© {new Date().getFullYear()} QuickBite</div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu size={21} />
                </Button>
              </DialogTrigger>
              <DialogContent className="mobile-menu">
                <DialogHeader>
                  <DialogTitle>QuickBite</DialogTitle>
                  <DialogDescription>Find your next favorite bite.</DialogDescription>
                </DialogHeader>
                <Navigation onNavigate={() => setOpen(false)} />
                <HelpDialog />
              </DialogContent>
            </Dialog>
            <Brand />
          </div>
          <div className="desktop-greeting">
            <span className="greeting-dot" /> A good day for good food
          </div>
          <form
            className="header-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              navigate(search.trim() ? `/?q=${encodeURIComponent(search.trim())}` : '/')
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search restaurants or dishes"
              placeholder="Search restaurants or dishes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" aria-label="Submit search">
              <ChevronRight size={16} />
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
              <Link to="/cart" aria-label={`Your cart, ${count} items`}>
                <ShoppingBag size={18} />
                <span className="cart-label">Cart</span>
                <span className="cart-count">{count}</span>
              </Link>
            </Button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>Good food. Good mood.</span>
          <span>
            Made with care, served with QuickBite <Leaf size={13} />
          </span>
        </footer>
      </div>
    </div>
  )
}
