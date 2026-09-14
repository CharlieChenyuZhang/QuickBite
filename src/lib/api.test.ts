// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickBiteApi } from './types'

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
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  sessionStorage.clear()
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

async function mountSession() {
  const { act, createElement } = await import('react')
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
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(SessionProvider, null, createElement(Probe)),
      ),
    )
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

  it('does not restore private cart data when a forgotten session probe finishes late', async () => {
    const oldResponse = deferred<Response>()
    fetchMock.mockReturnValueOnce(oldResponse.promise)
    const harness = await mountSession()
    await harness.act(async () => harness.session.forgetSession())
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
