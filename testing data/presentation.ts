import type { Category } from '../src/lib/presentation'

export const demoMeta: Record<
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
