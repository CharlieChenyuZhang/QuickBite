import type { Restaurant, MenuItem } from './types'
import { isDemoMode } from './api'

export const foodImage = (id: string, width = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
export const heroImage = foodImage('photo-1512621776951-a57141f2eefd', 1200)
export const categories = [
  { name: 'All', icon: '🍽️' },
  { name: 'Healthy', icon: '🥗' },
  { name: 'Pizza', icon: '🍕' },
  { name: 'Burgers', icon: '🍔' },
  { name: 'Asian', icon: '🍜' },
  { name: 'Mexican', icon: '🌮' },
] as const
export type Category = (typeof categories)[number]['name']
const demoMeta: Record<
  number,
  { cuisine: Category; description: string; image: string; tag: string }
> = {
  1: {
    cuisine: 'Healthy',
    description: 'Fresh bowls · Salads · Feel-good food',
    image: 'photo-1512621776951-a57141f2eefd',
    tag: 'A fresh favorite',
  },
  2: {
    cuisine: 'Pizza',
    description: 'Wood-fired pizza · Italian · Comfort food',
    image: 'photo-1579751626657-72bc17010498',
    tag: 'Comfort, by the slice',
  },
  3: {
    cuisine: 'Burgers',
    description: 'Craft burgers · American · Sides',
    image: 'photo-1568901346375-23c9450c58cd',
    tag: 'Big on flavor',
  },
  4: {
    cuisine: 'Asian',
    description: 'Japanese · Sushi · Rice bowls',
    image: 'photo-1579871494447-9811cf80d66c',
    tag: 'Something special',
  },
  5: {
    cuisine: 'Asian',
    description: 'Thai · Noodles · Curries',
    image: 'photo-1569718212165-3a8278d5f624',
    tag: 'Spice up your day',
  },
  6: {
    cuisine: 'Mexican',
    description: 'Street tacos · Mexican · Fresh salsas',
    image: 'photo-1551504734-5ee1c4a1479b',
    tag: 'A little fiesta',
  },
}
export function restaurantPresentation(
  restaurant: Restaurant,
  menus: MenuItem[] = restaurant.menu_items ?? [],
) {
  if (isDemoMode && demoMeta[restaurant.id]) {
    const meta = demoMeta[restaurant.id]
    return { ...meta, image: foodImage(meta.image) }
  }
  const name = `${restaurant.name} ${menus.map((item) => item.name).join(' ')}`.toLowerCase()
  const cuisine: Category = /pizza|pizzeria/.test(name)
    ? 'Pizza'
    : /burger/.test(name)
      ? 'Burgers'
      : /sushi|thai|noodle|ramen|asian|japanese/.test(name)
        ? 'Asian'
        : /taco|mexican|burrito/.test(name)
          ? 'Mexican'
          : /salad|green|vegan|healthy/.test(name)
            ? 'Healthy'
            : 'All'
  return {
    cuisine,
    description:
      restaurant.address ||
      (cuisine === 'All' ? 'Discover your next favorite dish' : `${cuisine} · Explore the menu`),
    image: restaurant.image_url || menus.find((item) => item.image_url)?.image_url,
    tag: 'Explore the menu',
  }
}
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'
