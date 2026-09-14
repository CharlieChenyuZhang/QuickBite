export interface MenuItem {
  id: number
  name: string
  price: number
  image_url?: string
  description?: string
  restaurant_id?: number
}

export interface Restaurant {
  id: number
  name: string
  address?: string
  phone?: string
  image_url?: string
  menu_items?: MenuItem[]
}

export interface CartItem {
  id?: number
  menu_id?: number
  menu_item_name: string
  price: number
  quantity?: number
}

export interface Cart {
  total_price: number
  order_items: CartItem[]
}

export interface Credentials {
  username: string
  password: string
}

export interface SignupInput {
  email: string
  password: string
  first_name: string
  last_name: string
}

export interface QuickBiteApi {
  getRestaurants(): Promise<Restaurant[]>
  getMenus(restaurantId: number): Promise<MenuItem[]>
  getCart(): Promise<Cart>
  login(credentials: Credentials): Promise<void>
  signup(input: SignupInput): Promise<void>
  addItemToCart(menuId: number): Promise<void>
  checkout(): Promise<void>
}
