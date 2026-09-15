import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMockServer } from './server.mjs'

const PASSWORD = 'QuickBite123!'

async function start(t) {
  const api = await createMockServer({ port: 0 })
  t.after(() => api.close())
  return api
}

function client(api) {
  let cookie = ''
  return {
    get cookie() {
      return cookie
    },
    async request(path, options = {}) {
      const response = await fetch(`${api.origin}${path}`, {
        ...options,
        headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) cookie = /Max-Age=0/i.test(setCookie) ? '' : setCookie.split(';')[0]
      return response
    },
    login(username, password = PASSWORD) {
      return this.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }),
      })
    },
    post(path, data) {
      return this.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      })
    },
    async cart() {
      const response = await this.request('/cart')
      assert.equal(response.status, 200)
      return response.json()
    },
  }
}

test('binds only to loopback and serves the shared restaurant and menu catalog', async (t) => {
  const api = await start(t)
  assert.equal(api.server.address().address, '127.0.0.1')
  const response = await fetch(`${api.origin}/restaurants/menu`)
  assert.equal(response.status, 200)
  const restaurants = await response.json()
  assert.equal(restaurants.length, 6)
  assert.equal(restaurants.flatMap((restaurant) => restaurant.menu_items).length, 30)
  const menu = await fetch(`${api.origin}/restaurant/1/menu`)
  assert.deepEqual(await menu.json(), restaurants[0].menu_items)
  assert.equal((await fetch(`${api.origin}/restaurant/999/menu`)).status, 404)
})

test('protects every cart operation and rejects incorrect login credentials', async (t) => {
  const user = client(await start(t))
  assert.equal((await user.request('/cart')).status, 401)
  assert.equal((await user.post('/cart', { menu_id: 101 })).status, 401)
  assert.equal((await user.post('/cart/checkout')).status, 401)
  assert.equal((await user.login('alex@quickbite.test', 'incorrect')).status, 401)
  assert.equal((await user.login('unknown@quickbite.test')).status, 401)
  assert.equal(user.cookie, '')
})

test('authenticates the seeded account with an HTTP-only cookie and its seeded cart', async (t) => {
  const user = client(await start(t))
  const response = await user.login('alex@quickbite.test')
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /Path=\//i)
  assert.doesNotMatch(cookie, /; Secure/i)
  assert.ok(!(await response.text()).includes(PASSWORD))
  const cart = await user.cart()
  assert.equal(cart.total_price, 32.5)
  assert.deepEqual(
    cart.order_items.map((item) => item.menu_id),
    [101, 201],
  )
  assert.ok(cart.order_items.every((item) => item.quantity === 1 && item.menu_item_name))
})

test('signup validates fields, detects duplicates, and requires a separate sign-in', async (t) => {
  const user = client(await start(t))
  const data = {
    email: 'new@quickbite.test',
    password: 'NewPassword123!',
    first_name: 'New',
    last_name: 'User',
  }
  assert.equal((await user.post('/signup', { ...data, password: 'short' })).status, 400)
  assert.equal((await user.post('/signup', { ...data, first_name: ' ' })).status, 400)
  assert.equal((await user.post('/signup', { ...data, email: 'invalid' })).status, 400)
  assert.equal((await user.post('/signup', data)).status, 201)
  assert.equal((await user.request('/cart')).status, 401)
  assert.equal((await user.post('/signup', { ...data, email: 'NEW@QUICKBITE.TEST' })).status, 409)
  assert.equal((await user.login(data.email, 'wrong')).status, 401)
  assert.equal((await user.login(' NEW@QUICKBITE.TEST ', data.password)).status, 200)
  assert.deepEqual(await user.cart(), { total_price: 0, order_items: [] })
})

test('calculates prices from the catalog and ignores submitted price and quantity', async (t) => {
  const user = client(await start(t))
  await user.login('sam@quickbite.test')
  assert.deepEqual(await user.cart(), { total_price: 0, order_items: [] })
  assert.equal((await user.post('/cart', { menu_id: 101, price: 0, quantity: 50 })).status, 204)
  let cart = await user.cart()
  assert.equal(cart.total_price, 14.5)
  assert.equal(cart.order_items.length, 1)
  assert.equal(cart.order_items[0].price, 14.5)
  assert.equal(cart.order_items[0].quantity, 1)
  assert.equal((await user.post('/cart', { menu_id: 102, total_price: -1 })).status, 204)
  cart = await user.cart()
  assert.equal(cart.total_price, 30.25)
  assert.equal(cart.order_items.length, 2)
})

test('rejects invalid cart requests without changing its contents', async (t) => {
  const user = client(await start(t))
  await user.login('sam@quickbite.test')
  for (const data of [{}, { menu_id: '101' }, { menu_id: -1 }, { menu_id: 1.5 }]) {
    assert.equal((await user.post('/cart', data)).status, 400)
  }
  assert.equal((await user.post('/cart', { menu_id: 9999 })).status, 404)
  assert.equal((await user.request('/cart', { method: 'POST', body: '{' })).status, 400)
  assert.equal((await user.post('/signup', [])).status, 400)
  assert.deepEqual(await user.cart(), { total_price: 0, order_items: [] })
})

test('checkout clears a nonempty cart and rejects a second empty checkout', async (t) => {
  const user = client(await start(t))
  await user.login('alex@quickbite.test')
  assert.equal((await user.post('/cart/checkout')).status, 204)
  assert.deepEqual(await user.cart(), { total_price: 0, order_items: [] })
  const empty = await user.post('/cart/checkout')
  assert.equal(empty.status, 400)
  assert.deepEqual(await empty.json(), { message: 'Your cart is empty.' })
})

test('logout expires the cookie and invalidates its token while retaining the account cart', async (t) => {
  const api = await start(t)
  const user = client(api)
  await user.login('alex@quickbite.test')
  await user.post('/cart', { menu_id: 102 })
  const oldCookie = user.cookie
  const response = await user.post('/logout')
  assert.equal(response.status, 204)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/i)
  assert.equal((await user.request('/cart')).status, 401)
  assert.equal((await fetch(`${api.origin}/cart`, { headers: { Cookie: oldCookie } })).status, 401)
  await user.login('alex@quickbite.test')
  assert.notEqual(user.cookie, oldCookie)
  assert.equal((await user.cart()).order_items.length, 3)
})

test('switching accounts rotates the session and never exposes another account cart', async (t) => {
  const api = await start(t)
  const user = client(api)
  await user.login('alex@quickbite.test')
  const previousCookie = user.cookie
  await user.login('sam@quickbite.test')
  assert.notEqual(user.cookie, previousCookie)
  assert.deepEqual(await user.cart(), { total_price: 0, order_items: [] })
  assert.equal(
    (await fetch(`${api.origin}/cart`, { headers: { Cookie: previousCookie } })).status,
    401,
  )
  await user.post('/logout')
  await user.login('alex@quickbite.test')
  assert.equal((await user.cart()).order_items.length, 2)
})

test('returns JSON 404 responses for unknown routes without reflecting the request', async (t) => {
  const api = await start(t)
  const response = await fetch(`${api.origin}/unknown?private=value`)
  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), { message: 'API route not found.' })
})

test('keeps user registrations, carts, and sessions isolated between server instances', async (t) => {
  const firstApi = await start(t)
  const secondApi = await start(t)
  const first = client(firstApi)
  const second = client(secondApi)
  await first.login('alex@quickbite.test')
  await first.post('/cart/checkout')
  assert.equal(
    (await fetch(`${secondApi.origin}/cart`, { headers: { Cookie: first.cookie } })).status,
    401,
  )
  await second.login('alex@quickbite.test')
  assert.equal((await second.cart()).order_items.length, 2)
  assert.deepEqual(await first.cart(), { total_price: 0, order_items: [] })
  await first.post('/signup', {
    email: 'only-first@quickbite.test',
    password: PASSWORD,
    first_name: 'First',
    last_name: 'Only',
  })
  assert.equal((await first.login('only-first@quickbite.test')).status, 200)
  assert.equal((await second.login('only-first@quickbite.test')).status, 401)
})
