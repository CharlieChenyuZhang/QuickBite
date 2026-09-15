// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickBiteApi } from './types'
import { demoApi as optionalDemoApi } from '@quickbite/testing-data'

let api: QuickBiteApi
let disposeSessionHarness: (() => Promise<void>) | undefined
const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function redirectedHtml(url: string): Response {
  const response = new Response('<html><body>Sign in</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: url },
  })
  return response
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubEnv('VITE_LOGOUT_PATH', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
  api = (await import('./api')).api
})

afterEach(async () => {
  await disposeSessionHarness?.()
  disposeSessionHarness = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function mountSession(strictMode = false) {
  const { act, createElement, StrictMode } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
  const { SessionProvider, useSession } = await import('./session')
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let current: ReturnType<typeof useSession> | undefined
  function Probe() {
    current = useSession()
    return null
  }
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  disposeSessionHarness = async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
  }
  await act(async () => {
    const provider = createElement(
      QueryClientProvider,
      { client },
      createElement(SessionProvider, null, createElement(Probe)),
    )
    root.render(strictMode ? createElement(StrictMode, null, provider) : provider)
  })
  await settle()
  return {
    client,
    act,
    settle,
    get session() {
      if (!current) throw new Error('Session provider did not render.')
      return current
    },
  }
}

describe('authentication cache boundaries', () => {
  it('does not let a canceled startup response overwrite the newly signed-in cart', async () => {
    const oldResponse = deferred<Response>()
    const oldCart = {
      total_price: 10,
      order_items: [{ menu_item_name: 'Previous account item', price: 10 }],
    }
    const newCart = {
      total_price: 25,
      order_items: [{ menu_item_name: 'New account item', price: 25 }],
    }
    fetchMock
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(newCart))
    const harness = await mountSession()

    await harness.act(() =>
      harness.session.signIn({ username: 'new@example.com', password: 'password123' }),
    )
    await harness.settle()
    await harness.act(async () => {
      oldResponse.resolve(jsonResponse(oldCart))
    })
    await harness.settle()

    expect(harness.session.username).toBe('new@example.com')
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.client.getQueryData(['cart'])).toEqual(newCart)
  })

  it('clears the previous identity immediately and keeps it cleared after failed sign-in', async () => {
    const loginResponse = deferred<Response>()
    const oldCart = {
      total_price: 10,
      order_items: [{ menu_item_name: 'Previous account item', price: 10 }],
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(oldCart))
      .mockReturnValueOnce(loginResponse.promise)
    sessionStorage.setItem('quickbite.display-name.v1', 'old@example.com')
    const harness = await mountSession()
    expect(harness.session.username).toBe('old@example.com')
    let signInError: unknown
    let signIn: Promise<void> | undefined

    await harness.act(async () => {
      signIn = harness.session
        .signIn({ username: 'new@example.com', password: 'wrong' })
        .catch((error: unknown) => {
          signInError = error
        })
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()

    await harness.act(async () => {
      loginResponse.resolve(new Response(null, { status: 401 }))
      await signIn
    })
    await harness.settle()
    expect(signInError).toMatchObject({ status: 401 })
    expect(harness.session.username).toBeNull()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
    expect(sessionStorage.getItem('quickbite.display-name.v1')).toBeNull()
  })

  it('does not restore private cart data when a cleared session probe finishes late', async () => {
    const oldResponse = deferred<Response>()
    fetchMock.mockReturnValueOnce(oldResponse.promise)
    const harness = await mountSession()
    const { clearPrivateSession } = await import('./queries')
    await harness.act(() => clearPrivateSession(harness.client))
    await harness.act(async () => {
      oldResponse.resolve(
        jsonResponse({
          total_price: 15,
          order_items: [{ menu_item_name: 'Private item', price: 15 }],
        }),
      )
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
  })

  it('retains the verified cart when signing in from an anonymous session', async () => {
    const cart = { total_price: 15, order_items: [{ menu_item_name: 'Lunch', price: 15 }] }
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(cart))
    const harness = await mountSession()
    expect(harness.session.isAuthenticated).toBe(false)
    await harness.act(() =>
      harness.session.signIn({ username: 'alex@example.com', password: 'password123' }),
    )
    await harness.settle()
    expect(harness.session.username).toBe('alex@example.com')
    expect(harness.client.getQueryData(['cart'])).toEqual(cart)
    expect(sessionStorage.getItem('quickbite.display-name.v1')).toBe('alex@example.com')
  })
})

describe('existing Spring Boot API contract', () => {
  it('keeps restaurant and menu routes and includes the session cookie', async () => {
    const restaurants = [{ id: 7, name: 'Cafe', menu_items: [] }]
    const menu = [{ id: 41, name: 'Lunch', price: 12.5 }]
    fetchMock
      .mockResolvedValueOnce(jsonResponse(restaurants))
      .mockResolvedValueOnce(jsonResponse(menu))

    await expect(api.getRestaurants()).resolves.toEqual(restaurants)
    await expect(api.getMenus(7)).resolves.toEqual(menu)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/restaurants/menu',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/restaurant/7/menu',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('sends login credentials in a URL-encoded body, never in the URL', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const credentials = { username: 'alex+food@example.com', password: 'secret&=? value' }
    await api.login(credentials)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/login')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).get('Content-Type')).toContain(
      'application/x-www-form-urlencoded',
    )
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('username')).toBe(credentials.username)
    expect(body.get('password')).toBe(credentials.password)
  })

  it('preserves signup snake_case keys', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }))
    const input = {
      email: 'alex@example.com',
      password: 'password123',
      first_name: 'Alex',
      last_name: 'Chen',
    }
    await api.signup(input)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        credentials: 'include',
      }),
    )
  })

  it('adds only menu_id and checks out through the unchanged endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await api.addItemToCart(123)
    await api.checkout()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/cart',
      expect.objectContaining({
        method: 'POST',
        body: '{"menu_id":123}',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/cart/checkout',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock.mock.calls[1][1]?.body).toBeUndefined()
  })

  it('preserves the server cart total and order item shape', async () => {
    const cart = {
      total_price: 28.5,
      order_items: [
        { id: 3, menu_item_name: 'Noodles', price: 14.25 },
        { id: 4, menu_item_name: 'Noodles', price: 14.25 },
      ],
    }
    fetchMock.mockResolvedValue(jsonResponse(cart))
    await expect(api.getCart()).resolves.toEqual(cart)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cart',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('forwards the optional Spring Security CSRF cookie only on mutations', async () => {
    document.cookie = 'XSRF-TOKEN=csrf%2Btoken; path=/'
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse([]))
    await api.addItemToCart(123)
    await api.getRestaurants()
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-XSRF-TOKEN')).toBe('csrf+token')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('honors a configured API origin without duplicating a trailing slash', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/')
    vi.resetModules()
    const configuredApi = (await import('./api')).api
    fetchMock.mockResolvedValue(jsonResponse([]))
    await configuredApi.getRestaurants()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/restaurants/menu')
  })
})

describe('authentication and failure handling', () => {
  it('treats a redirected 200 login page as an unauthenticated cart', async () => {
    fetchMock.mockResolvedValue(redirectedHtml('https://api.example.com/login'))
    await expect(api.getCart()).rejects.toMatchObject({ name: 'ApiError', status: 401 })
  })

  it('detects Spring Security failed-login redirects', async () => {
    fetchMock.mockResolvedValue(redirectedHtml('https://api.example.com/login?error'))
    await expect(
      api.login({ username: 'alex@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'The email or password is incorrect.',
    })
  })

  it('accepts a successful form redirect for subsequent session verification', async () => {
    fetchMock.mockResolvedValue(redirectedHtml('https://api.example.com/'))
    await expect(
      api.login({ username: 'alex@example.com', password: 'valid' }),
    ).resolves.toBeUndefined()
  })

  it('surfaces an expired cookie as an authentication error', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    await expect(api.getCart()).rejects.toMatchObject({
      status: 401,
      message: 'Please sign in to continue.',
    })
  })

  it('rejects an HTML fallback instead of treating it as restaurant data', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Vite fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
    )
    await expect(api.getRestaurants()).rejects.toMatchObject({ status: 502 })
  })

  it('surfaces network failures and never silently substitutes demo data', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.getRestaurants()).rejects.toMatchObject({ name: 'ApiError', status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed checkout mutation', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))
    await expect(api.checkout()).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports malformed JSON as a usable API error', async () => {
    fetchMock.mockResolvedValue(
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    )
    await expect(api.getCart()).rejects.toMatchObject({ name: 'ApiError', status: 502 })
  })
})

describe('logout API contract', () => {
  it('posts logout with cookies, CSRF protection, and a bounded request signal', async () => {
    document.cookie = 'XSRF-TOKEN=logout%2Btoken; path=/'
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.logout()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-XSRF-TOKEN')).toBe(
      'logout+token',
    )
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Accept')).toContain('text/html')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('accepts Spring logout success redirects but still rejects failed-login redirects', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectedHtml('https://api.example.com/login?logout'))
      .mockResolvedValueOnce(redirectedHtml('https://api.example.com/login?error'))
      .mockResolvedValueOnce(redirectedHtml('https://api.example.com/login?logout&error'))
    await expect(api.logout()).resolves.toBeUndefined()
    await expect(
      api.login({ username: 'alex@example.com', password: 'bad' }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(api.logout()).rejects.toMatchObject({ status: 401 })
  })

  it('supports a configured logout path relative to the backend origin', async () => {
    vi.stubEnv('VITE_LOGOUT_PATH', '/auth/end-session')
    vi.resetModules()
    const configuredApi = (await import('./api')).api
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await configuredApi.logout()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/end-session')
  })

  it('rejects an absolute logout URL instead of sending cookies to another origin', async () => {
    vi.stubEnv('VITE_LOGOUT_PATH', 'https://other.example.com/logout')
    vi.resetModules()
    const configuredApi = (await import('./api')).api
    await expect(configuredApi.logout()).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('verified sign-out', () => {
  const cart = { total_price: 15, order_items: [{ menu_item_name: 'Private lunch', price: 15 }] }

  it.each(['empty', 'redirect'])(
    'clears account data after %s logout and an uncached unauthorized cart probe',
    async (responseType) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(cart))
        .mockResolvedValueOnce(
          responseType === 'empty'
            ? new Response(null, { status: 204 })
            : redirectedHtml('https://api.example.com/login?logout'),
        )
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
      sessionStorage.setItem('quickbite.display-name.v1', 'alex@example.com')
      const harness = await mountSession()
      expect(harness.session.isAuthenticated).toBe(true)
      await harness.act(() => harness.session.signOut())
      await harness.settle()
      expect(harness.session.isAuthenticated).toBe(false)
      expect(harness.session.isSigningOut).toBe(false)
      expect(harness.session.sessionId).toBeNull()
      expect(harness.client.getQueryData(['cart'])).toBeUndefined()
      expect(sessionStorage.getItem('quickbite.display-name.v1')).toBeNull()
      expect(sessionStorage.getItem('quickbite.session-generation.v1')).toBeNull()
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        '/api/cart',
        expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
      )
    },
  )

  it.each([403, 404, 500])(
    'keeps the account and cart on logout HTTP %i and permits retry',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(cart))
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
      sessionStorage.setItem('quickbite.display-name.v1', 'alex@example.com')
      const harness = await mountSession()
      const sessionId = harness.session.sessionId
      await harness.act(async () => {
        await expect(harness.session.signOut()).rejects.toMatchObject({ status })
      })
      await harness.settle()
      expect(harness.session.isAuthenticated).toBe(true)
      expect(harness.session.username).toBe('alex@example.com')
      expect(harness.session.sessionId).toBe(sessionId)
      expect(harness.session.isSigningOut).toBe(false)
      expect(harness.client.getQueryData(['cart'])).toEqual(cart)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await harness.act(() => harness.session.signOut())
      await harness.settle()
      expect(harness.session.isAuthenticated).toBe(false)
    },
  )

  it('keeps the account after network failure without automatically retrying logout', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const harness = await mountSession()
    await harness.act(async () => {
      await expect(harness.session.signOut()).rejects.toMatchObject({ status: 0 })
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.session.isSigningOut).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toEqual(cart)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not claim success when the backend cookie still authenticates', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(cart))
    const harness = await mountSession()
    await harness.act(async () => {
      await expect(harness.session.signOut()).rejects.toMatchObject({
        status: 409,
        message: 'Your session is still active. Please try signing out again.',
      })
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.client.getQueryData(['cart'])).toEqual(cart)
  })

  it('keeps account state when the post-logout verification request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError('Verification timed out'))
    const harness = await mountSession()
    const sessionId = harness.session.sessionId
    await harness.act(async () => {
      await expect(harness.session.signOut()).rejects.toMatchObject({ status: 0 })
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.session.sessionId).toBe(sessionId)
    expect(harness.session.isSigningOut).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toEqual(cart)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('deduplicates simultaneous sign-out requests while preserving the current account during verification', async () => {
    const logoutResponse = deferred<Response>()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockReturnValueOnce(logoutResponse.promise)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    const harness = await mountSession()
    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    await harness.act(async () => {
      first = harness.session.signOut()
      second = harness.session.signOut()
    })
    await harness.settle()
    expect(first).toBe(second)
    expect(harness.session.isSigningOut).toBe(true)
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.client.getQueryData(['cart'])).toEqual(cart)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await harness.act(async () => {
      logoutResponse.resolve(new Response(null, { status: 204 }))
      await first
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('prevents an old session refetch from restoring private data after verified logout', async () => {
    const oldProbe = deferred<Response>()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockReturnValueOnce(oldProbe.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    const harness = await mountSession()
    await harness.act(async () => {
      void harness.client.invalidateQueries({ queryKey: ['session'] })
    })
    await harness.act(() => harness.session.signOut())
    await harness.act(async () => {
      oldProbe.resolve(jsonResponse(cart))
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
  })

  it('preserves the generation on revalidation and rotates it when the same user signs in again', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(cart))
    sessionStorage.setItem('quickbite.display-name.v1', 'alex@example.com')
    sessionStorage.setItem('quickbite.session-generation.v1', 'verified-previous-generation')
    const harness = await mountSession()
    expect(harness.session.sessionId).toBe('verified-previous-generation')
    await harness.act(() => harness.client.invalidateQueries({ queryKey: ['session'] }))
    await harness.settle()
    expect(harness.session.sessionId).toBe('verified-previous-generation')
    await harness.act(() => harness.session.signOut())
    await harness.act(() =>
      harness.session.signIn({ username: 'alex@example.com', password: 'password123' }),
    )
    await harness.settle()
    expect(harness.session.sessionId).not.toBe('verified-previous-generation')
    expect(harness.session.sessionId).toBe(
      sessionStorage.getItem('quickbite.session-generation.v1'),
    )
  })
})

describe.skipIf(!optionalDemoApi)('demo account isolation', () => {
  it('logs out without deleting saved carts or exposing another account cart', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.resetModules()
    const demo = (await import('./api')).api
    await demo.login({ username: 'first@example.com', password: 'first-password' })
    await demo.addItemToCart(101)
    const firstCart = await demo.getCart()
    await demo.logout()
    await expect(demo.getCart()).rejects.toMatchObject({ status: 401 })
    await demo.login({ username: 'second@example.com', password: 'second-password' })
    await expect(demo.getCart()).resolves.toEqual({ total_price: 0, order_items: [] })
    await demo.addItemToCart(201)
    await demo.logout()
    await demo.login({ username: 'first@example.com', password: 'first-password' })
    await expect(demo.getCart()).resolves.toEqual(firstCart)
    expect(sessionStorage.getItem('quickbite.demo.v1')).not.toContain('first-password')
    expect(sessionStorage.getItem('quickbite.demo.v1')).not.toContain('second-password')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('live cross-tab account boundaries', () => {
  const sharedRevisionKey = 'quickbite.auth.v1:live:%2Fapi:revision'
  const seenRevisionKey = 'quickbite.auth.v1:live:%2Fapi:seen-revision'
  function mockChannel() {
    const channel = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage: vi.fn(),
      close: vi.fn(),
    }
    vi.stubGlobal(
      'BroadcastChannel',
      vi.fn(function () {
        return channel
      }),
    )
    return channel
  }

  it('clears a remote logout without rebroadcasting, and closes its channel on unmount', async () => {
    const channel = mockChannel()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        total_price: 10,
        order_items: [{ menu_item_name: 'Private item', price: 10 }],
      }),
    )
    sessionStorage.setItem('quickbite.display-name.v1', 'previous@example.com')
    const harness = await mountSession()
    await harness.act(async () => {
      channel.onmessage?.(new MessageEvent('message', { data: 'signed-out' }))
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
    expect(sessionStorage.getItem('quickbite.display-name.v1')).toBeNull()
    expect(channel.postMessage).not.toHaveBeenCalled()
    await disposeSessionHarness?.()
    disposeSessionHarness = undefined
    expect(channel.close).toHaveBeenCalledOnce()
  })

  it('discards the previous display name before verifying a remote sign-in', async () => {
    const channel = mockChannel()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          total_price: 10,
          order_items: [{ menu_item_name: 'Previous item', price: 10 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ total_price: 0, order_items: [] }))
    sessionStorage.setItem('quickbite.display-name.v1', 'previous@example.com')
    const harness = await mountSession()
    const previousId = harness.session.sessionId
    await harness.act(async () => {
      channel.onmessage?.(new MessageEvent('message', { data: 'signed-in' }))
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.session.username).toBe('Food lover')
    expect(harness.session.sessionId).not.toBe(previousId)
    expect(harness.client.getQueryData(['cart'])).toEqual({ total_price: 0, order_items: [] })
    expect(channel.postMessage).not.toHaveBeenCalled()
  })

  it.skipIf(!optionalDemoApi)(
    'does not connect tab-local demo sessions to a shared auth channel',
    async () => {
      mockChannel()
      vi.stubEnv('VITE_DEMO_MODE', 'true')
      vi.resetModules()
      await mountSession()
      expect(BroadcastChannel).not.toHaveBeenCalled()
    },
  )

  it('discards a missed account boundary before restoring a suspended tab identity', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    localStorage.setItem(sharedRevisionKey, 'new-account-revision')
    sessionStorage.setItem(seenRevisionKey, 'old-account-revision')
    sessionStorage.setItem('quickbite.display-name.v1', 'old@example.com')
    sessionStorage.setItem('quickbite.session-generation.v1', 'old-receipt-generation')
    fetchMock.mockResolvedValueOnce(jsonResponse({ total_price: 0, order_items: [] }))
    const harness = await mountSession()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.session.username).toBe('Food lover')
    expect(harness.session.sessionId).not.toBe('old-receipt-generation')
    expect(sessionStorage.getItem(seenRevisionKey)).toBe('new-account-revision')
  })

  it('verifies an authenticated new tab after StrictMode cancels its initial revision-change probe', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    localStorage.setItem(sharedRevisionKey, 'another-tab-sign-in')
    fetchMock.mockImplementation(async () => jsonResponse({ total_price: 0, order_items: [] }))
    const harness = await mountSession(true)
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(true)
    expect(harness.session.username).toBe('Food lover')
    expect(harness.session.sessionId).toBeTruthy()
    expect(harness.client.getQueryData(['cart'])).toEqual({ total_price: 0, order_items: [] })
  })

  it('reconciles a resumed tab immediately even when its session query is still fresh', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const newProbe = deferred<Response>()
    localStorage.setItem(sharedRevisionKey, 'old-account-revision')
    sessionStorage.setItem(seenRevisionKey, 'old-account-revision')
    sessionStorage.setItem('quickbite.display-name.v1', 'old@example.com')
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          total_price: 10,
          order_items: [{ menu_item_name: 'Old private item', price: 10 }],
        }),
      )
      .mockReturnValueOnce(newProbe.promise)
    const harness = await mountSession()
    const previousId = harness.session.sessionId
    localStorage.setItem(sharedRevisionKey, 'new-account-revision')
    await harness.act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await harness.settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
    await harness.act(async () => {
      newProbe.resolve(jsonResponse({ total_price: 0, order_items: [] }))
    })
    await harness.settle()
    expect(harness.session.username).toBe('Food lover')
    expect(harness.session.sessionId).not.toBe(previousId)
    expect(harness.client.getQueryData(['cart'])).toEqual({ total_price: 0, order_items: [] })
  })

  it('rejects an in-flight cart response when the shared account revision changed', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const oldProbe = deferred<Response>()
    localStorage.setItem(sharedRevisionKey, 'old-account-revision')
    sessionStorage.setItem(seenRevisionKey, 'old-account-revision')
    fetchMock.mockReturnValueOnce(oldProbe.promise)
    const harness = await mountSession()
    localStorage.setItem(sharedRevisionKey, 'new-account-revision')
    await harness.act(async () => {
      oldProbe.resolve(
        jsonResponse({
          total_price: 10,
          order_items: [{ menu_item_name: 'Old private item', price: 10 }],
        }),
      )
    })
    await harness.settle()
    expect(harness.session.isAuthenticated).toBe(false)
    expect(harness.session.error).toMatchObject({ status: 409 })
    expect(harness.client.getQueryData(['cart'])).toBeUndefined()
  })
})
