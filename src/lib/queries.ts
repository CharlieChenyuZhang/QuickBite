import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'

export const queryKeys = {
  restaurants: ['restaurants'] as const,
  menus: (id: number) => ['menus', id] as const,
  cart: ['cart'] as const,
  session: ['session'] as const,
}

const sessionTransitions = new WeakSet<QueryClient>()

function sessionGeneration(client: QueryClient): string | undefined {
  return client.getQueryData<{ sessionId: string }>(queryKeys.session)?.sessionId
}

export function setSessionTransition(client: QueryClient, active: boolean): void {
  if (active) sessionTransitions.add(client)
  else sessionTransitions.delete(client)
}

export async function clearPrivateSession(client: QueryClient): Promise<void> {
  const cancellations = [
    client.cancelQueries({ queryKey: queryKeys.session }),
    client.cancelQueries({ queryKey: queryKeys.cart }),
  ]
  // Clear immediately. A delayed cancellation callback must never remove a newer cart.
  client.removeQueries({ queryKey: queryKeys.cart })
  client.setQueryData(queryKeys.session, null)
  await Promise.all(cancellations)
}

export function expireSession(client: QueryClient, error: unknown): void {
  if (!sessionTransitions.has(client) && error instanceof ApiError && error.status === 401) {
    void clearPrivateSession(client)
  }
}

export function useRestaurants() {
  return useQuery({
    queryKey: queryKeys.restaurants,
    queryFn: api.getRestaurants,
    staleTime: 5 * 60 * 1000,
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
  })
}

export function useMenus(id: number) {
  return useQuery({
    queryKey: queryKeys.menus(id),
    queryFn: () => api.getMenus(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60 * 1000,
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
  })
}

export function useCart(enabled = true) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.cart,
    queryFn: api.getCart,
    enabled,
    staleTime: 15 * 1000,
    retry: false,
  })
  useEffect(() => {
    // Ignore an error belonging to a cart removed by a newer authentication attempt.
    if (query.error && client.getQueryState(queryKeys.cart)?.error === query.error) {
      expireSession(client, query.error)
    }
  }, [client, query.error])
  return query
}

export function useAddToCart() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (menuId: number) => {
      if (sessionTransitions.has(client))
        throw new ApiError('Please wait until your account change is complete.', 409)
      return api.addItemToCart(menuId)
    },
    retry: false,
    onMutate: () => ({ sessionId: sessionGeneration(client) }),
    onSuccess: (_data, _variables, context) => {
      if (!sessionTransitions.has(client) && context?.sessionId === sessionGeneration(client)) {
        return client.invalidateQueries({ queryKey: queryKeys.cart })
      }
    },
    onError: (error, _variables, context) => {
      if (context?.sessionId === sessionGeneration(client)) expireSession(client, error)
    },
  })
}

export function useCheckout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (sessionTransitions.has(client))
        throw new ApiError('Please wait until your account change is complete.', 409)
      return api.checkout()
    },
    retry: false,
    onMutate: () => ({ sessionId: sessionGeneration(client) }),
    onSuccess: (_data, _variables, context) => {
      if (!sessionTransitions.has(client) && context?.sessionId === sessionGeneration(client)) {
        return client.invalidateQueries({ queryKey: queryKeys.cart })
      }
    },
    onError: (error, _variables, context) => {
      if (context?.sessionId === sessionGeneration(client)) expireSession(client, error)
    },
  })
}
