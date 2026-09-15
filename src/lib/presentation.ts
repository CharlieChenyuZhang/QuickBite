import { demoMeta } from '@quickbite/testing-data'
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
