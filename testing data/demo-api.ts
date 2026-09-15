import catalog from './catalog.json'
import { ApiError } from '../src/lib/api-error'
import type { Cart, QuickBiteApi, Restaurant } from '../src/lib/types'

const demoRestaurants: Restaurant[] = catalog

interface DemoState {
  username: string | null
  carts: Record<string, Cart>
}

const storageKey = 'quickbite.demo.v1'
let memoryState: DemoState = { username: null, carts: {} }

function readState(): DemoState {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return memoryState
    const parsed = JSON.parse(raw) as DemoState
    if (
      (parsed.username === null || typeof parsed.username === 'string') &&
      parsed.carts &&
      typeof parsed.carts === 'object'
    ) {
      memoryState = parsed
    }
  } catch {
    // Storage can be unavailable in private browsing. Keep this tab usable.
  }
  return memoryState
}

function saveState(state: DemoState): void {
  memoryState = state
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // In-memory state is sufficient when the browser disallows storage.
  }
}

function authenticatedState(): DemoState & { username: string } {
  const state = readState()
  if (!state.username) throw new ApiError('Please sign in to continue.', 401)
  return state as DemoState & { username: string }
}

function currentCart(state: DemoState & { username: string }): Cart {
  const cart = state.carts[state.username]
  if (!cart || !Array.isArray(cart.order_items) || !Number.isFinite(cart.total_price)) {
    return { order_items: [], total_price: 0 }
  }
  return cart
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function forgetDemoSession(): void {
  const state = readState()
  saveState({ ...state, username: null })
}

export const demoApi: QuickBiteApi = {
  async logout() {
    forgetDemoSession()
  },
  async getRestaurants() {
    return copy(demoRestaurants)
  },
  async getMenus(id) {
    const restaurant = demoRestaurants.find((item) => item.id === id)
    if (!restaurant) throw new ApiError('We could not find this restaurant.', 404)
    return copy(restaurant.menu_items || [])
  },
  async getCart() {
    return copy(currentCart(authenticatedState()))
  },
  async login({ username, password }) {
    if (!username.trim() || !password.trim()) {
      throw new ApiError('Please enter an email and password.', 400)
    }
    // Demo authentication accepts any nonempty credentials and never stores passwords.
    saveState({ ...readState(), username: username.trim() })
  },
  async signup(input) {
    if (
      !input.email.trim() ||
      !input.password ||
      !input.first_name.trim() ||
      !input.last_name.trim()
    ) {
      throw new ApiError('Please complete every field to create your account.', 400)
    }
  },
  async addItemToCart(id) {
    const state = authenticatedState()
    const item = demoRestaurants
      .flatMap((restaurant) => restaurant.menu_items || [])
      .find((menu) => menu.id === id)
    if (!item) throw new ApiError('This menu item is no longer available.', 404)
    const cart = currentCart(state)
    const order_items = [
      ...cart.order_items,
      {
        id: Math.max(0, ...cart.order_items.map((row) => row.id || 0)) + 1,
        menu_id: id,
        menu_item_name: item.name,
        price: item.price,
        quantity: 1,
      },
    ]
    const total_price =
      Math.round(order_items.reduce((sum, row) => sum + row.price * (row.quantity || 1), 0) * 100) /
      100
    saveState({
      ...state,
      carts: { ...state.carts, [state.username]: { order_items, total_price } },
    })
  },
  async checkout() {
    const state = authenticatedState()
    if (currentCart(state).order_items.length === 0) throw new ApiError('Your cart is empty.', 400)
    saveState({
      ...state,
      carts: { ...state.carts, [state.username]: { order_items: [], total_price: 0 } },
    })
  },
}
