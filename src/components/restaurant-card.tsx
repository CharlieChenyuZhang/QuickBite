import { ArrowUpRight, Heart, Leaf } from 'lucide-react'
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
    <article className="restaurant-card group">
      <div className="restaurant-photo">
        <Link to={`/restaurants/${restaurant.id}`} tabIndex={-1} aria-hidden="true">
          <FoodImage src={meta.image} alt="" />
        </Link>
        <span className="photo-tag">
          {meta.cuisine === 'Healthy' && <Leaf size={12} />} {meta.tag}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="save-button"
          aria-label={`${saved ? 'Unsave' : 'Save'} ${restaurant.name}`}
          aria-pressed={saved}
          onClick={() => toggle(restaurant.id)}
        >
          <Heart size={18} className={saved ? 'fill-primary text-primary' : ''} />
        </Button>
      </div>
      <Link className="restaurant-title" to={`/restaurants/${restaurant.id}`}>
        <h3>{restaurant.name}</h3>
        <ArrowUpRight size={20} />
      </Link>
      <p className="restaurant-description">{meta.description}</p>
      <div className="restaurant-footer">
        <span>{meta.cuisine === 'All' ? 'Restaurant' : meta.cuisine}</span>
        <span>
          View menu <ArrowUpRight size={13} />
        </span>
      </div>
    </article>
  )
}
