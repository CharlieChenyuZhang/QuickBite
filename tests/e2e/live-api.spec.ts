import { expect, test, type Page } from '@playwright/test'
import type { Cart } from '../../src/lib/types'

const menu = [
  { id: 71, name: 'Seasonal Bowl', price: 14.5, description: 'Fresh vegetables and rice.' },
]
const restaurants = [{ id: 7, name: 'Live Kitchen', address: '7 Main Street', menu_items: menu }]

async function mockServer(page: Page) {
  const state = {
    authenticated: false,
    catalogStatus: 200,
    menuStatus: 200,
    loginStatus: 200,
    addStatus: 200,
    checkoutStatus: 200,
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
    if (path === '/api/login') {
      state.loginBody = request.postData() || ''
      state.loginContentType = request.headers()['content-type'] || ''
      state.csrfHeader = request.headers()['x-xsrf-token'] || ''
      state.authenticated = state.loginStatus === 200
      return route.fulfill({ status: state.loginStatus, body: '' })
    }
    if (path === '/api/cart' && request.method() === 'GET') {
      return route.fulfill({ status: state.authenticated ? 200 : 401, json: state.cart })
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

async function fillLogin(page: Page) {
  await page.getByLabel('Email or username').fill('alex@example.com')
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
