import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FoodImage } from './food-image'
import { useFavorites } from '@/lib/favorites'
import { restaurantPresentation } from '@/lib/presentation'
import type { Restaurant, MenuItem } from '@/lib/types'

export function RestaurantCard({
  restaurant,
  menus,
}: {
  restaurant: Restaurant
  menus?: MenuItem[]
}) {
  const { ids, toggle } = useFavorites()
  const meta = restaurantPresentation(restaurant, menus)
  const saved = ids.includes(restaurant.id)
  return (
    <article className="restaurant-card">
      <Link
        className="restaurant-card-link"
        to={'/restaurants/' + restaurant.id}
        aria-label={restaurant.name}
      >
        <div className="restaurant-photo">
          <FoodImage src={meta.image} alt="" />
        </div>
        <div className="restaurant-card-body">
          <h3>{restaurant.name}</h3>
          <p className="restaurant-description">{meta.description}</p>
        </div>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="save-button"
        aria-label={(saved ? 'Unsave' : 'Save') + ' ' + restaurant.name}
        aria-pressed={saved}
        onClick={() => toggle(restaurant.id)}
      >
        <Heart size={19} className={saved ? 'fill-primary text-primary' : ''} />
      </Button>
    </article>
  )
}
