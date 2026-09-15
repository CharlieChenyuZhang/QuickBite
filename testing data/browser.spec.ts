import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const password = 'QuickBite123!'

async function signIn(page: Page, email: string, destination = '/cart') {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`)
  await page.getByLabel('Email or username').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/login' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL((url) => url.pathname === destination)
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/logout' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  expect((await response).status()).toBe(204)
  await expect(page).toHaveURL((url) => url.pathname === '/login')
  await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
  expect((await page.request.get('/api/cart')).status()).toBe(401)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'My account', exact: true })).toHaveCount(0)
}

async function fillSignup(page: Page, email: string) {
  await page.goto('/signup')
  await page.getByLabel('First name', { exact: true }).fill('Browser')
  await page.getByLabel('Last name', { exact: true }).fill('Tester')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
}

test('seeded carts use HTTP cookie sessions, survive refresh, and stay isolated after logout', async ({
  page,
}) => {
  await signIn(page, 'alex@quickbite.test')
  await expect(page.getByRole('heading', { name: 'The Green Goddess', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Classic Margherita', exact: true })).toBeVisible()
  await expect(page.getByText('$32.50', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()

  const cookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'quickbite_mock_session',
  )
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('quickbite_mock_session')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()
  const cart = await page.request.get('/api/cart')
  expect(cart.status()).toBe(200)
  expect(await cart.json()).toMatchObject({
    total_price: 32.5,
    order_items: [{ menu_id: 101 }, { menu_id: 201 }],
  })

  await signOut(page)
  await signIn(page, 'sam@quickbite.test')
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Green Goddess', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Classic Margherita', exact: true })).toHaveCount(
    0,
  )
})

test('a newly registered account can add items and complete checkout through the HTTP API', async ({
  page,
}) => {
  const email = `browser-${randomUUID()}@quickbite.test`
  await fillSignup(page, email)
  const signup = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/signup' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await signup).status()).toBe(201)
  await expect(page).toHaveURL((url) => url.pathname === '/login')
  await signIn(page, email, '/restaurants/1')
  await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add The Green Goddess to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
  await page.goto('/restaurants/2')
  await page.getByRole('button', { name: 'Add Classic Margherita to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()
  await page.goto('/cart')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()
  await expect(page.getByText('$32.50', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Checkout', exact: true }).click()
  const checkout = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/cart/checkout' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  expect((await checkout).status()).toBe(204)
  await expect(page).toHaveURL((url) => url.pathname === '/order-confirmation')
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toBeVisible()
  await expect(page.getByText('$32.50', { exact: true })).toBeVisible()
  const emptyCart = await page.request.get('/api/cart')
  expect(emptyCart.status()).toBe(200)
  expect(await emptyCart.json()).toEqual({ order_items: [], total_price: 0 })
  await page.goto('/cart')
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()
  await signOut(page)
})

test('duplicate signup and incorrect passwords are rejected by the server and can be corrected', async ({
  page,
}) => {
  await fillSignup(page, 'alex@quickbite.test')
  const duplicate = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/signup' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await duplicate).status()).toBe(409)
  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.')
  await expect(page).toHaveURL((url) => url.pathname === '/signup')

  await page.goto('/login?redirect=%2Fcart')
  await page.getByLabel('Email or username').fill('sam@quickbite.test')
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password')
  const rejected = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/login' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await rejected).status()).toBe(401)
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.')
  await expect(page).toHaveURL((url) => url.pathname === '/login')
  expect((await page.request.get('/api/cart')).status()).toBe(401)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/cart')
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()
})
