import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Cart } from '../../src/lib/types'

const menu = [
  { id: 71, name: 'Seasonal Bowl', price: 14.5, description: 'Fresh vegetables and rice.' },
]
const restaurants = [{ id: 7, name: 'Live Kitchen', address: '7 Main Street', menu_items: menu }]

async function mockServer(page: Page | BrowserContext) {
  const state = {
    authenticated: false,
    catalogStatus: 200,
    menuStatus: 200,
    loginStatus: 200,
    addStatus: 200,
    checkoutStatus: 200,
    logoutStatus: 204,
    logoutKeepsSession: false,
    logoutGate: undefined as Promise<void> | undefined,
    logoutCalls: 0,
    logoutMethod: '',
    logoutCsrf: '',
    logoutCookie: '',
    requests: [] as string[],
    cartStatuses: [] as number[],
    catalogHtml: false,
    checkoutCalls: 0,
    loginBody: '',
    loginContentType: '',
    csrfHeader: '',
    addBody: null as unknown,
    cart: { order_items: [], total_price: 0 } as Cart,
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    state.requests.push(`${request.method()} ${path}`)
    if (path === '/api/restaurants/menu') {
      if (state.catalogHtml)
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<html>Server error</html>',
        })
      return route.fulfill({
        status: state.catalogStatus,
        json: state.catalogStatus === 200 ? restaurants : {},
      })
    }
    if (path === '/api/restaurant/7/menu') {
      return route.fulfill({ status: state.menuStatus, json: state.menuStatus === 200 ? menu : {} })
    }
    if (path === '/api/login' && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html>Logged out</html>',
      })
    }
    if (path === '/api/login' && request.method() === 'POST') {
      state.loginBody = request.postData() || ''
      state.loginContentType = request.headers()['content-type'] || ''
      state.csrfHeader = request.headers()['x-xsrf-token'] || ''
      state.authenticated = state.loginStatus === 200
      return route.fulfill({
        status: state.loginStatus,
        headers: state.authenticated
          ? { 'set-cookie': 'JSESSIONID=test-session; Path=/; HttpOnly; SameSite=Lax' }
          : {},
        body: '',
      })
    }
    if (path === '/api/logout') {
      state.logoutCalls += 1
      state.logoutMethod = request.method()
      state.logoutCsrf = request.headers()['x-xsrf-token'] || ''
      state.logoutCookie = request.headers().cookie || ''
      if (state.logoutGate) await state.logoutGate
      const succeeded = state.logoutStatus >= 200 && state.logoutStatus < 400
      if (succeeded && !state.logoutKeepsSession) state.authenticated = false
      return route.fulfill({
        status: state.logoutStatus,
        headers: {
          ...(state.logoutStatus === 302 ? { location: '/login?logout' } : {}),
          ...(!state.authenticated
            ? { 'set-cookie': 'JSESSIONID=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' }
            : {}),
        },
        body: '',
      })
    }
    if (path === '/api/cart' && request.method() === 'GET') {
      const status = state.authenticated ? 200 : 401
      state.cartStatuses.push(status)
      return route.fulfill({ status, json: state.cart })
    }
    if (path === '/api/cart' && request.method() === 'POST') {
      state.addBody = request.postDataJSON()
      if (state.addStatus === 401) state.authenticated = false
      if (state.addStatus === 200) {
        state.cart = {
          order_items: [{ id: 1, menu_id: 71, menu_item_name: 'Seasonal Bowl', price: 14.5 }],
          total_price: 14.5,
        }
      }
      return route.fulfill({ status: state.addStatus, body: '' })
    }
    if (path === '/api/cart/checkout') {
      state.checkoutCalls += 1
      if (state.checkoutStatus === 200) state.cart = { order_items: [], total_price: 0 }
      return route.fulfill({ status: state.checkoutStatus, body: '' })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  return state
}

async function fillLogin(page: Page, email = 'alex@example.com') {
  await page.getByLabel('Email or username').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('restaurant errors remain visible without demo fallback and can be retried', async ({
  page,
}) => {
  const server = await mockServer(page)
  server.catalogStatus = 503
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'We couldn’t load this just yet', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toHaveCount(0)
  await expect(page.getByText('Demo', { exact: true })).toHaveCount(0)
  server.catalogStatus = 200
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Live Kitchen', exact: true })).toBeVisible()
})

test('an unexpected HTML API response is reported as an error', async ({ page }) => {
  const server = await mockServer(page)
  server.catalogHtml = true
  await page.goto('/')
  await expect(
    page.getByText('QuickBite returned an unexpected response. Please try again.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toHaveCount(0)
})

test('failed login can recover using the unchanged Spring form and CSRF contract', async ({
  page,
  context,
}) => {
  const server = await mockServer(page)
  server.loginStatus = 401
  await context.addCookies([
    { name: 'XSRF-TOKEN', value: 'test%20csrf', url: 'http://127.0.0.1:5174' },
  ])
  await page.goto('/login?redirect=%2Frestaurants%2F7')
  await fillLogin(page)
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.')
  await expect(page).toHaveURL(/\/login\?/)
  server.loginStatus = 200
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/restaurants\/7$/)
  expect(Object.fromEntries(new URLSearchParams(server.loginBody))).toEqual({
    username: 'alex@example.com',
    password: 'test-password',
  })
  expect(server.loginContentType).toContain('application/x-www-form-urlencoded')
  expect(server.csrfHeader).toBe('test csrf')
  await page.getByRole('button', { name: 'Add Seasonal Bowl to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
  expect(server.addBody).toEqual({ menu_id: 71 })
})

test('an expired session clears cart identity and returns to sign in', async ({ page }) => {
  const server = await mockServer(page)
  await page.goto('/login?redirect=%2Frestaurants%2F7')
  await fillLogin(page)
  await expect(page).toHaveURL(/\/restaurants\/7$/)
  server.addStatus = 401
  await page.getByRole('button', { name: 'Add Seasonal Bowl to cart', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=%2Frestaurants%2F7/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
})

test('checkout failure requires cart review and never silently resubmits an order', async ({
  page,
}) => {
  const server = await mockServer(page)
  await page.goto('/login?redirect=%2Frestaurants%2F7')
  await fillLogin(page)
  await expect(page).toHaveURL(/\/restaurants\/7$/)
  await page.getByRole('button', { name: 'Add Seasonal Bowl to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
  server.checkoutStatus = 503
  await page.goto('/checkout')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your order may have been received.')
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Review cart', exact: true })).toBeVisible()
  expect(server.checkoutCalls).toBe(1)
  await page.getByRole('link', { name: 'Review cart', exact: true }).click()
  await expect(page).toHaveURL(/\/cart$/)
  await expect(page.getByText('Seasonal Bowl', { exact: true })).toBeVisible()
  server.checkoutStatus = 200
  await page.getByRole('link', { name: 'Checkout', exact: true }).click()
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toBeVisible()
  expect(server.checkoutCalls).toBe(2)
})

test('menu request failures preserve the restaurant context and offer retry', async ({ page }) => {
  const server = await mockServer(page)
  server.menuStatus = 503
  await page.goto('/restaurants/7')
  await expect(page.getByRole('heading', { name: 'Live Kitchen', exact: true })).toBeVisible()
  await expect(
    page.getByText('We could not load this menu. Please try again.', { exact: true }),
  ).toBeVisible()
  server.menuStatus = 200
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Add Seasonal Bowl to cart', exact: true }),
  ).toBeVisible()
})

async function signInWithCart(page: Page) {
  await page.goto('/login?redirect=%2Frestaurants%2F7')
  await fillLogin(page)
  await expect(page).toHaveURL(/\/restaurants\/7$/)
  await page.getByRole('button', { name: 'Add Seasonal Bowl to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
}

for (const status of [204, 302]) {
  test(`logout accepts HTTP ${status} and verifies server session invalidation`, async ({
    page,
    context,
  }) => {
    const server = await mockServer(page)
    server.logoutStatus = status
    await context.addCookies([
      { name: 'XSRF-TOKEN', value: 'logout%20csrf', url: 'http://127.0.0.1:5174' },
    ])
    await signInWithCart(page)
    await page.getByRole('button', { name: 'My account', exact: true }).click()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(server.logoutCalls).toBe(1)
    expect(server.logoutMethod).toBe('POST')
    expect(server.logoutCsrf).toBe('logout csrf')
    expect(server.logoutCookie).toContain('JSESSIONID=test-session')
    const logoutIndex = server.requests.lastIndexOf('POST /api/logout')
    expect(server.requests.slice(logoutIndex + 1)).toContain('GET /api/cart')
    expect(server.cartStatuses.at(-1)).toBe(401)
    await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await page.goto('/cart')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcart$/)
    await expect(page.getByText('Seasonal Bowl', { exact: true })).toHaveCount(0)
  })
}

test('pending logout disables both account actions and submits only once', async ({ page }) => {
  const server = await mockServer(page)
  let releaseLogout!: () => void
  server.logoutGate = new Promise<void>((resolve) => {
    releaseLogout = resolve
  })
  await signInWithCart(page)
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).dblclick()
  try {
    await expect(page.getByRole('button', { name: 'Logging out…', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Switch account', exact: true })).toBeDisabled()
    await expect.poll(() => server.logoutCalls).toBe(1)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
  } finally {
    releaseLogout()
  }
  await expect(page).toHaveURL(/\/login$/)
  expect(server.logoutCalls).toBe(1)
})

for (const status of [403, 500]) {
  test(`HTTP ${status} logout failure retains identity and supports explicit retry`, async ({
    page,
  }) => {
    const server = await mockServer(page)
    server.logoutStatus = status
    await signInWithCart(page)
    await page.getByRole('button', { name: 'My account', exact: true }).click()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('alert')).toContainText(
      status === 403 ? 'This request was not authorized.' : 'We could not sign you out.',
    )
    await expect(dialog).toContainText('alex@example.com')
    await expect(page).toHaveURL(/\/restaurants\/7$/)
    await expect(dialog.getByRole('button', { name: 'Log out', exact: true })).toBeEnabled()
    expect(server.authenticated).toBe(true)
    expect(server.logoutCalls).toBe(1)
    server.logoutStatus = 204
    await dialog.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(server.logoutCalls).toBe(2)
    await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
  })
}

test('a successful logout response cannot fake success while the session stays active', async ({
  page,
}) => {
  const server = await mockServer(page)
  server.logoutStatus = 200
  server.logoutKeepsSession = true
  await signInWithCart(page)
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('Your session is still active.')
  await expect(dialog).toContainText('alex@example.com')
  await expect(page).toHaveURL(/\/restaurants\/7$/)
  expect(server.cartStatuses.at(-1)).toBe(200)
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  server.logoutKeepsSession = false
  await page.getByRole('button', { name: 'Switch account', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(server.logoutCalls).toBe(2)
})

test('logout and account changes synchronize private state across live browser tabs', async ({
  page,
  context,
}) => {
  const server = await mockServer(context)
  await signInWithCart(page)
  const otherTab = await context.newPage()
  await otherTab.goto('http://127.0.0.1:5174/cart')
  await expect(otherTab.getByText('Seasonal Bowl', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(otherTab).toHaveURL(/\/login\?redirect=%2Fcart$/)
  await expect(otherTab.getByText('Seasonal Bowl', { exact: true })).toHaveCount(0)
  await expect(
    otherTab.getByRole('link', { name: 'Your cart, 0 items', exact: true }),
  ).toBeVisible()

  server.cart = {
    order_items: [{ id: 2, menu_id: 72, menu_item_name: 'Another account meal', price: 22 }],
    total_price: 22,
  }
  await fillLogin(page, 'blair@example.com')
  await expect(page).toHaveURL('http://127.0.0.1:5174/')
  await expect(otherTab).toHaveURL(/\/cart$/)
  await expect(otherTab.getByText('Another account meal', { exact: true })).toBeVisible()
  await expect(otherTab.getByText('Seasonal Bowl', { exact: true })).toHaveCount(0)
  await otherTab.getByRole('button', { name: 'My account', exact: true }).click()
  await expect(otherTab.getByRole('dialog')).not.toContainText('alex@example.com')
})

test('returning after missed account notifications discards stale identity and order receipt', async ({
  page,
  context,
}) => {
  const server = await mockServer(context)
  await signInWithCart(page)
  await page.goto('/checkout')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toBeVisible()
  await expect(page.getByText('Seasonal Bowl', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'My account', exact: true })).toContainText(
    'alex@example.com',
  )

  // Unload the application so it misses notifications while its storage and history survive.
  await page.goto('about:blank')
  const otherTab = await context.newPage()
  await otherTab.goto('http://127.0.0.1:5174/')
  await otherTab.getByRole('button', { name: 'My account', exact: true }).click()
  await otherTab.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(otherTab).toHaveURL(/\/login$/)
  server.cart = {
    order_items: [{ id: 2, menu_id: 72, menu_item_name: 'Another account meal', price: 22 }],
    total_price: 22,
  }
  await fillLogin(otherTab, 'blair@example.com')
  await expect(otherTab).toHaveURL('http://127.0.0.1:5174/')

  const freshSessionProbe = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/cart' && response.request().method() === 'GET',
  )
  await page.goBack()
  const response = await freshSessionProbe
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual(server.cart)
  await expect(page.getByRole('button', { name: 'My account', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'My account', exact: true })).not.toContainText(
    'alex@example.com',
  )
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toHaveCount(0)
  await expect(page.getByText('Seasonal Bowl', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('alex@example.com')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('link', { name: 'Your cart, 1 items', exact: true }).click()
  await expect(page.getByText('Another account meal', { exact: true })).toBeVisible()
  await expect(page.getByText('Seasonal Bowl', { exact: true })).toHaveCount(0)
})
