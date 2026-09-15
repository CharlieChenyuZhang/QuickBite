import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const COOKIE_NAME = 'quickbite_mock_session'
const COOKIE_OPTIONS = 'Path=/; HttpOnly; SameSite=Lax'
const readSeed = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'))
const normalizeEmail = (email) => email.trim().toLowerCase()
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(status === 204 ? undefined : JSON.stringify(data))
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size <= 64 * 1024) chunks.push(chunk)
  }
  if (size > 64 * 1024) throw new RequestError(413, 'Request body is too large.')
  return Buffer.concat(chunks).toString('utf8')
}

async function readJson(request) {
  let value
  try {
    value = JSON.parse(await readBody(request))
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError(400, 'A valid JSON request body is required.')
  }
  if (!isRecord(value)) throw new RequestError(400, 'A JSON object is required.')
  return value
}

function sessionCookie(request) {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1)
}

/** Start an isolated local test API. All state is discarded when this instance closes. */
export async function createMockServer(options = {}) {
  const port = options.port ?? 8787
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Port must be an integer from 0 to 65535.')
  }
  const [catalogSeed, userSeed, cartSeed] = await Promise.all([
    options.catalog ?? readSeed('catalog.json'),
    options.users ?? readSeed('users.json'),
    options.carts ?? readSeed('carts.json'),
  ])
  const catalog = structuredClone(catalogSeed)
  const users = new Map(structuredClone(userSeed).map((user) => [normalizeEmail(user.email), user]))
  const carts = new Map(Object.entries(structuredClone(cartSeed)))
  const menus = new Map(
    catalog.flatMap((restaurant) => restaurant.menu_items ?? []).map((item) => [item.id, item]),
  )
  const sessions = new Map()
  for (const [email, ids] of carts) {
    if (!users.has(email) || !Array.isArray(ids) || ids.some((id) => !menus.has(id))) {
      throw new Error('Seed carts must reference existing test users and menu items.')
    }
  }

  function authenticatedUser(request) {
    const email = sessions.get(sessionCookie(request))
    if (!email) throw new RequestError(401, 'Please sign in to continue.')
    return email
  }

  function cartFor(email) {
    const order_items = (carts.get(email) ?? []).map((menuId, index) => {
      const item = menus.get(menuId)
      return {
        id: index + 1,
        menu_id: item.id,
        menu_item_name: item.name,
        price: Math.round(item.price * 100) / 100,
        quantity: 1,
      }
    })
    const cents = order_items.reduce((total, item) => total + Math.round(item.price * 100), 0)
    return { total_price: cents / 100, order_items }
  }

  async function handle(request, response) {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    const route = `${request.method} ${path}`
    if (route === 'GET /restaurants/menu') return send(response, 200, catalog)
    const menuMatch = request.method === 'GET' && path.match(/^\/restaurant\/(\d+)\/menu$/)
    if (menuMatch) {
      const restaurant = catalog.find((item) => item.id === Number(menuMatch[1]))
      if (!restaurant) throw new RequestError(404, 'Restaurant not found.')
      return send(response, 200, restaurant.menu_items ?? [])
    }
    if (route === 'POST /signup') {
      const data = await readJson(request)
      if (
        typeof data.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) ||
        typeof data.password !== 'string' ||
        data.password.length < 8 ||
        typeof data.first_name !== 'string' ||
        !data.first_name.trim() ||
        typeof data.last_name !== 'string' ||
        !data.last_name.trim()
      )
        throw new RequestError(
          400,
          'Enter an email, first and last name, and a password of at least 8 characters.',
        )
      const email = normalizeEmail(data.email)
      if (users.has(email))
        throw new RequestError(409, 'An account with this email already exists.')
      users.set(email, {
        email,
        password: data.password,
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
      })
      carts.set(email, [])
      return send(response, 201, { message: 'Account created.' })
    }
    if (route === 'POST /login') {
      const form = new URLSearchParams(await readBody(request))
      const email = normalizeEmail(form.get('username') ?? '')
      const user = users.get(email)
      if (!user || user.password !== form.get('password')) {
        throw new RequestError(401, 'The email or password is incorrect.')
      }
      sessions.delete(sessionCookie(request))
      const token = randomUUID()
      sessions.set(token, email)
      response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${COOKIE_OPTIONS}`)
      return send(response, 200, { message: 'Signed in.' })
    }
    if (route === 'POST /logout') {
      sessions.delete(sessionCookie(request))
      response.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${COOKIE_OPTIONS}; Max-Age=0`)
      return send(response, 204)
    }
    if (route === 'GET /cart') {
      return send(response, 200, cartFor(authenticatedUser(request)))
    }
    if (route === 'POST /cart') {
      const email = authenticatedUser(request)
      const { menu_id } = await readJson(request)
      if (!Number.isInteger(menu_id) || menu_id <= 0) {
        throw new RequestError(400, 'A valid menu_id is required.')
      }
      if (!menus.has(menu_id)) throw new RequestError(404, 'Menu item not found.')
      // Client-supplied prices and quantities never affect the server-computed cart.
      carts.set(email, [...(carts.get(email) ?? []), menu_id])
      return send(response, 204)
    }
    if (route === 'POST /cart/checkout') {
      const email = authenticatedUser(request)
      if (!(carts.get(email) ?? []).length) throw new RequestError(400, 'Your cart is empty.')
      carts.set(email, [])
      return send(response, 204)
    }
    throw new RequestError(404, 'API route not found.')
  }

  const server = createServer((request, response) => {
    void handle(request, response)
      .catch((error) => {
        if (response.writableEnded) return
        send(response, error instanceof RequestError ? error.status : 500, {
          message:
            error instanceof RequestError
              ? error.message
              : 'The local test API could not complete this request.',
        })
      })
      .finally(() => request.resume())
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeIdleConnections()
      }),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args.length !== 2 || args[0] !== '--port')) {
      throw new Error('Usage: node "testing data/server.mjs" [--port 8787]')
    }
    const api = await createMockServer({ port: args.length ? Number(args[1]) : 8787 })
    console.log(`QuickBite local test API: ${api.origin}`)
    console.log(
      'In-memory test data only. Restarting resets accounts and carts. No real orders or payments.',
    )
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void api.close()
      })
  } catch (error) {
    console.error(`Local test API stopped: ${error.message}`)
    process.exitCode = 1
  }
}
