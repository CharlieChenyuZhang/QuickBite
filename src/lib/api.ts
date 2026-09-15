import { demoApi } from '@quickbite/testing-data'
import { ApiError } from './api-error'
import type { Cart, MenuItem, QuickBiteApi, Restaurant } from './types'

export { ApiError } from './api-error'

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const logoutPath = import.meta.env.VITE_LOGOUT_PATH || '/logout'

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function statusError(status: number, fallback: string, endpoint: string): ApiError {
  if (status === 401) return new ApiError('Please sign in to continue.', status)
  if (status === 403) {
    return new ApiError('This request was not authorized. Please refresh and try again.', status)
  }
  if (status === 409 && endpoint === '/signup')
    return new ApiError('An account with this email already exists.', status)
  if (status === 429)
    return new ApiError('Too many attempts. Please wait a moment and try again.', status)
  return new ApiError(fallback, status)
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  expectsJson = true,
  fallback = 'Something went wrong. Please try again.',
  allowLogoutRedirect = false,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (options.method && options.method !== 'GET') {
    const token = csrfToken()
    if (token) headers.set('X-XSRF-TOKEN', token)
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: options.signal ?? AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ApiError('Unable to connect to QuickBite. Check your connection and try again.', 0)
  }

  // Spring Security can redirect failed authentication to a 200 HTML login page.
  const isLoginRedirect = response.redirected && /\/login(?:[/?#]|$)/.test(response.url)
  const isSuccessfulLogoutRedirect =
    allowLogoutRedirect &&
    isLoginRedirect &&
    new URL(response.url).searchParams.has('logout') &&
    !new URL(response.url).searchParams.has('error')
  if (isLoginRedirect && !isSuccessfulLogoutRedirect) {
    throw new ApiError(
      endpoint === '/login' ? 'The email or password is incorrect.' : 'Please sign in to continue.',
      401,
    )
  }
  if (!response.ok) {
    if (endpoint === '/login' && (response.status === 400 || response.status === 401)) {
      throw new ApiError('The email or password is incorrect.', response.status)
    }
    throw statusError(response.status, fallback, endpoint)
  }
  if (!expectsJson) return undefined as T

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    if (response.redirected && contentType.includes('text/html')) {
      throw new ApiError('Please sign in to continue.', 401)
    }
    throw new ApiError('QuickBite returned an unexpected response. Please try again.', 502)
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('QuickBite returned an invalid response. Please try again.', 502)
  }
}

const liveApi: QuickBiteApi = {
  getRestaurants: () =>
    request<Restaurant[]>(
      '/restaurants/menu',
      {},
      true,
      'We could not load restaurants. Please try again.',
    ),
  getMenus: (id) =>
    request<MenuItem[]>(
      `/restaurant/${id}/menu`,
      {},
      true,
      'We could not load this menu. Please try again.',
    ),
  getCart: () =>
    request<Cart>(
      '/cart',
      { cache: 'no-store' },
      true,
      'We could not load your cart. Please try again.',
    ),
  login: (credentials) =>
    request<void>(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          username: credentials.username,
          password: credentials.password,
        }),
      },
      false,
      'We could not sign you in. Please check your details and try again.',
    ),
  logout: () => {
    if (!logoutPath.startsWith('/') || logoutPath.startsWith('//') || /[\\?#\s]/.test(logoutPath)) {
      return Promise.reject(
        new ApiError(
          'The logout endpoint is not configured correctly. Please contact support.',
          500,
        ),
      )
    }
    return request<void>(
      logoutPath,
      { method: 'POST', headers: { Accept: 'text/html, application/json' } },
      false,
      'We could not sign you out. Please try again.',
      true,
    )
  },
  signup: (input) =>
    request<void>(
      '/signup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      false,
      'We could not create your account. Please check your details and try again.',
    ),
  addItemToCart: (menuId) =>
    request<void>(
      '/cart',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_id: menuId }),
      },
      false,
      'We could not add this item. Please try again.',
    ),
  checkout: () =>
    request<void>(
      '/cart/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      false,
      'We could not place your order. Check your cart before trying again.',
    ),
}

function requireDemoApi(): QuickBiteApi {
  if (!demoApi)
    throw new Error(
      'Demo mode requires the optional testing data folder. Use live API mode after removing it.',
    )
  return demoApi
}

// Mock data is opt-in. The live build resolves the optional entry to an empty module.
export const api: QuickBiteApi = isDemoMode ? requireDemoApi() : liveApi
