import { useSyncExternalStore } from 'react'
import { isDemoMode } from './api'
const key = `quickbite:saved-restaurants:${isDemoMode ? 'demo' : 'live'}`
const listeners = new Set<() => void>()
let saved: number[] = []
try {
  const value: unknown = JSON.parse(localStorage.getItem(key) || '[]')
  if (Array.isArray(value)) saved = value.filter((id): id is number => typeof id === 'number')
} catch {
  /* Storage is optional. */
}
export function useFavorites() {
  const ids = useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    () => saved,
  )
  return {
    ids,
    toggle: (id: number) => {
      saved = saved.includes(id) ? saved.filter((value) => value !== id) : [...saved, id]
      try {
        localStorage.setItem(key, JSON.stringify(saved))
      } catch {
        /* Keep in-memory preferences if storage is unavailable. */
      }
      listeners.forEach((callback) => callback())
    },
  }
}
