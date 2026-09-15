import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBackend, parseApiBase } from './check-backend.mjs'

const json = (data) => Response.json(data)
const apiBase = 'https://quickbite.example/api'

test('rejects credentials and ambiguous API URLs', () => {
  for (const value of [
    '',
    '/api',
    'file:///etc/passwd',
    'https://user:secret@example.com',
    `${apiBase}?key=secret`,
    `${apiBase}#fragment`,
  ]) {
    assert.throws(() => parseApiBase(value))
  }
  assert.equal(parseApiBase(`${apiBase}/`), apiBase)
})

test('checks real JSON contracts and the anonymous cart boundary using GET only', async () => {
  const calls = []
  const results = await checkBackend(apiBase, async (url, options) => {
    calls.push(url)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.Cookie, undefined)
    if (url.endsWith('/restaurants/menu')) return json([{ id: 7, name: 'Restaurant' }])
    if (url.endsWith('/restaurant/7/menu')) return json([{ id: 8, name: 'Dish', price: 12 }])
    return new Response(null, { status: 401 })
  })
  assert.equal(calls.length, 3)
  assert.ok(results.every((result) => result.outcome === 'ok'))
  assert.ok(results.every((result) => !('data' in result)))
})

test('reports protected discovery as incomplete, without calling it a connection failure', async () => {
  const results = await checkBackend(
    apiBase,
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: '/login' },
      }),
  )
  assert.equal(results[0].outcome, 'auth-required')
  assert.equal(results[1].outcome, 'ok')
})

test('rejects SPA HTML, a successful unauthenticated cart, and unexpected redirects', async () => {
  for (const response of [
    () => new Response('<html>QuickBite demo</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => json([]),
    () => new Response(null, { status: 302, headers: { Location: '/somewhere-else' } }),
  ]) {
    const results = await checkBackend(apiBase, async () => response())
    assert.equal(results[1].outcome, 'failed')
  }
})

test('rejects incorrect restaurant and menu data shapes', async () => {
  const results = await checkBackend(apiBase, async (url) => {
    if (url.endsWith('/restaurants/menu')) return json([{ id: 1, name: 'Restaurant' }])
    if (url.endsWith('/restaurant/1/menu')) return json([{ id: 2, name: 'Dish', price: '12.00' }])
    return new Response(null, { status: 403 })
  })
  assert.equal(results[2].outcome, 'failed')
  const invalid = await checkBackend(apiBase, async () => json({ error: 'Not a list' }))
  assert.equal(invalid[0].outcome, 'failed')
})

test('reports network errors and does not expose response data', async () => {
  const results = await checkBackend(apiBase, async () => {
    throw new Error('Internal secret')
  })
  assert.ok(results.every((result) => result.outcome === 'failed'))
  assert.ok(!JSON.stringify(results).includes('secret'))
})

test('does not treat a forbidden cart as a verified anonymous session boundary', async () => {
  const results = await checkBackend(apiBase, async (url) =>
    url.endsWith('/cart') ? new Response(null, { status: 403 }) : json([]),
  )
  assert.equal(results[0].outcome, 'ok')
  assert.equal(results[1].outcome, 'auth-required')
  assert.match(results[1].detail, /HTTP 401 or a login redirect/)
})
