import { ApiError } from './api'
import type { Cart, MenuItem, QuickBiteApi, Restaurant } from './types'

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85`
const photos = {
  salad: photo('photo-1512621776951-a57141f2eefd'),
  bowl: photo('photo-1540420773420-3366772f4999'),
  pizza: photo('photo-1513104890138-7c749659a591'),
  pasta: photo('photo-1473093295043-cdd812d0e601'),
  burger: photo('photo-1568901346375-23c9450c58cd'),
  fries: photo('photo-1573080496219-bb080dd4f877'),
  sushi: photo('photo-1579871494447-9811cf80d66c'),
  noodles: photo('photo-1569718212165-3a8278d5f624'),
  thai: photo('photo-1562565652-a0d8f0c59eb4'),
  tacos: photo('photo-1551504734-5ee1c4a1479b'),
}

const menus: Record<number, MenuItem[]> = {
  1: [
    {
      id: 101,
      name: 'The Green Goddess',
      price: 14.5,
      description: 'Avocado, baby greens, cucumber, quinoa, and our bright herb dressing.',
      image_url: photos.salad,
    },
    {
      id: 102,
      name: 'Harvest Grain Bowl',
      price: 15.75,
      description: 'Roasted sweet potato, warm grains, chickpeas, and lemon tahini.',
      image_url: photos.bowl,
    },
    {
      id: 103,
      name: 'Mediterranean Crunch',
      price: 14,
      description: 'Crisp greens, feta, olives, cucumber, and a zesty oregano vinaigrette.',
      image_url: photos.salad,
    },
    {
      id: 104,
      name: 'Miso Mushroom Bowl',
      price: 16.5,
      description: 'Roasted mushrooms, brown rice, edamame, and sesame miso sauce.',
      image_url: photos.bowl,
    },
    {
      id: 105,
      name: 'Citrus Avocado Salad',
      price: 13.5,
      description: 'Seasonal citrus, creamy avocado, peppery arugula, and toasted seeds.',
      image_url: photos.salad,
    },
  ],
  2: [
    {
      id: 201,
      name: 'Classic Margherita',
      price: 18,
      description: 'San Marzano tomatoes, fresh mozzarella, basil, and extra virgin olive oil.',
      image_url: photos.pizza,
    },
    {
      id: 202,
      name: 'Hot Honey Pepperoni',
      price: 21,
      description: 'Crispy pepperoni cups, mozzarella, and a drizzle of spicy honey.',
      image_url: photos.pizza,
    },
    {
      id: 203,
      name: 'Wild Mushroom Pizza',
      price: 20,
      description: 'Roasted mushrooms, garlic cream, mozzarella, and fresh thyme.',
      image_url: photos.pizza,
    },
    {
      id: 204,
      name: 'Basil Pesto Pasta',
      price: 17,
      description: 'Pasta tossed in basil pesto with cherry tomatoes and parmesan.',
      image_url: photos.pasta,
    },
    {
      id: 205,
      name: 'Garden Primavera',
      price: 19,
      description: 'Seasonal vegetables, tomato sauce, fresh mozzarella, and basil.',
      image_url: photos.pizza,
    },
  ],
  3: [
    {
      id: 301,
      name: 'The Club Classic',
      price: 15,
      description: 'Smashed beef patty, American cheese, crisp lettuce, and our house sauce.',
      image_url: photos.burger,
    },
    {
      id: 302,
      name: 'Double Smash',
      price: 18.5,
      description: 'Two crispy beef patties, double cheese, pickles, and caramelized onions.',
      image_url: photos.burger,
    },
    {
      id: 303,
      name: 'Smoky BBQ Burger',
      price: 17,
      description: 'Beef patty, smoky barbecue sauce, cheddar, and crispy onions.',
      image_url: photos.burger,
    },
    {
      id: 304,
      name: 'Garden Club Burger',
      price: 16,
      description: 'A plant-based patty with avocado, crunchy slaw, and tangy house sauce.',
      image_url: photos.burger,
    },
    {
      id: 305,
      name: 'Sea Salt Fries',
      price: 5.5,
      description: 'Golden, crisp fries finished with flaky sea salt.',
      image_url: photos.fries,
    },
  ],
  4: [
    {
      id: 401,
      name: 'Salmon Avocado Roll',
      price: 16,
      description: 'Fresh salmon and creamy avocado wrapped in seasoned sushi rice.',
      image_url: photos.sushi,
    },
    {
      id: 402,
      name: 'Sakura Sushi Set',
      price: 24,
      description: 'A colorful selection of the kitchen’s favorite rolls and nigiri.',
      image_url: photos.sushi,
    },
    {
      id: 403,
      name: 'Spicy Tuna Roll',
      price: 17,
      description: 'Tuna, cucumber, spicy mayo, and toasted sesame.',
      image_url: photos.sushi,
    },
    {
      id: 404,
      name: 'Miso Ramen',
      price: 18,
      description: 'Springy noodles in a rich miso broth with mushrooms, corn, and egg.',
      image_url: photos.noodles,
    },
    {
      id: 405,
      name: 'Vegetable Udon',
      price: 16.5,
      description: 'Thick udon noodles, seasonal vegetables, and a savory dashi broth.',
      image_url: photos.noodles,
    },
  ],
  5: [
    {
      id: 501,
      name: 'Classic Pad Thai',
      price: 17,
      description: 'Wok-tossed rice noodles, tamarind, egg, bean sprouts, and crushed peanuts.',
      image_url: photos.thai,
    },
    {
      id: 502,
      name: 'Thai Basil Noodles',
      price: 17.5,
      description: 'Wide rice noodles with sweet basil, crisp vegetables, and chili.',
      image_url: photos.noodles,
    },
    {
      id: 503,
      name: 'Green Curry Bowl',
      price: 18,
      description: 'Fragrant coconut green curry with vegetables and jasmine rice.',
      image_url: photos.thai,
    },
    {
      id: 504,
      name: 'Sesame Tofu Bowl',
      price: 16,
      description: 'Crispy tofu, crunchy vegetables, jasmine rice, and sesame dressing.',
      image_url: photos.bowl,
    },
    {
      id: 505,
      name: 'Bangkok Garden Salad',
      price: 13,
      description: 'Shredded greens, fresh herbs, cucumber, and a lime chili dressing.',
      image_url: photos.salad,
    },
  ],
  6: [
    {
      id: 601,
      name: 'Street Taco Trio',
      price: 15,
      description: 'Three corn tortillas with seasoned chicken, onion, cilantro, and salsa.',
      image_url: photos.tacos,
    },
    {
      id: 602,
      name: 'Carne Asada Tacos',
      price: 17,
      description: 'Grilled steak, fresh guacamole, pico de gallo, and a squeeze of lime.',
      image_url: photos.tacos,
    },
    {
      id: 603,
      name: 'Baja Fish Tacos',
      price: 17.5,
      description: 'Crispy fish, bright cabbage slaw, and creamy chipotle sauce.',
      image_url: photos.tacos,
    },
    {
      id: 604,
      name: 'Roasted Veggie Tacos',
      price: 14,
      description: 'Roasted seasonal vegetables, black beans, avocado, and salsa verde.',
      image_url: photos.tacos,
    },
    {
      id: 605,
      name: 'Casa Burrito Bowl',
      price: 16,
      description: 'Cilantro rice, black beans, roasted vegetables, salsa, and guacamole.',
      image_url: photos.bowl,
    },
  ],
}

export const demoRestaurants: Restaurant[] = [
  {
    id: 1,
    name: 'Green & Grain',
    address: '243 Valencia Street, San Francisco',
    image_url: photos.bowl,
  },
  {
    id: 2,
    name: 'Pizzeria Uno',
    address: '518 Columbus Avenue, San Francisco',
    image_url: photos.pizza,
  },
  {
    id: 3,
    name: 'The Burger Club',
    address: '1068 Market Street, San Francisco',
    image_url: photos.burger,
  },
  {
    id: 4,
    name: 'Sakura Kitchen',
    address: '1732 Post Street, San Francisco',
    image_url: photos.sushi,
  },
  {
    id: 5,
    name: 'Little Bangkok',
    address: '421 Larkin Street, San Francisco',
    image_url: photos.thai,
  },
  {
    id: 6,
    name: 'Casa de Tacos',
    address: '2985 Mission Street, San Francisco',
    image_url: photos.tacos,
  },
].map((restaurant) => ({
  ...restaurant,
  menu_items: menus[restaurant.id].map((item) => ({ ...item, restaurant_id: restaurant.id })),
}))

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
