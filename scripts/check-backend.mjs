import { pathToFileURL } from 'node:url'

export function parseApiBase(value) {
  if (!value)
    throw new Error('Provide the real API base URL, including /api only when using a proxy.')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('The API base must be an absolute HTTP or HTTPS URL.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Use an HTTP or HTTPS URL without credentials, query parameters, or a fragment.',
    )
  }
  return url.href.replace(/\/$/, '')
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasIdentity = (value) =>
  isRecord(value) && Number.isInteger(value.id) && value.id > 0 && typeof value.name === 'string'

async function probe(base, path, fetcher) {
  let response
  try {
    response = await fetcher(`${base}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { path, outcome: 'failed', detail: 'Connection failed or timed out.' }
  }

  if (response.status === 401 || response.status === 403) {
    return {
      path,
      outcome: 'auth-required',
      status: response.status,
      detail: `HTTP ${response.status}: authentication or authorization is required.`,
    }
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    let loginRedirect = false
    try {
      loginRedirect = /\/login\/?$/.test(new URL(location, base).pathname)
    } catch {
      // Missing or invalid redirect locations cannot establish API compatibility.
    }
    return {
      path,
      outcome: loginRedirect ? 'auth-required' : 'failed',
      detail: loginRedirect
        ? `HTTP ${response.status}: redirected to login.`
        : `HTTP ${response.status}: unexpected redirect.`,
    }
  }
  if (!response.ok) return { path, outcome: 'failed', detail: `HTTP ${response.status}.` }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    return {
      path,
      outcome: 'failed',
      detail:
        'Expected JSON; received a page or another content type. Check the API URL and proxy.',
    }
  }
  try {
    return {
      path,
      outcome: 'ok',
      detail: `HTTP ${response.status}: JSON received.`,
      data: await response.json(),
    }
  } catch {
    return { path, outcome: 'failed', detail: 'The response is not valid JSON.' }
  }
}

export async function checkBackend(value, fetcher = fetch) {
  const base = parseApiBase(value)
  const [restaurants, cart] = await Promise.all([
    probe(base, '/restaurants/menu', fetcher),
    probe(base, '/cart', fetcher),
  ])
  const results = [restaurants, cart]

  if (restaurants.outcome === 'ok') {
    if (!Array.isArray(restaurants.data) || !restaurants.data.every(hasIdentity)) {
      restaurants.outcome = 'failed'
      restaurants.detail = 'Restaurant JSON does not match the existing QuickBite contract.'
    } else {
      restaurants.detail = `${restaurants.data.length} restaurant(s); response matches the expected contract.`
      if (restaurants.data.length > 0) {
        const menu = await probe(base, `/restaurant/${restaurants.data[0].id}/menu`, fetcher)
        if (menu.outcome === 'ok') {
          if (
            !Array.isArray(menu.data) ||
            !menu.data.every(
              (item) => hasIdentity(item) && Number.isFinite(item.price) && item.price >= 0,
            )
          ) {
            menu.outcome = 'failed'
            menu.detail = 'Menu JSON does not match the existing QuickBite contract.'
          } else {
            menu.detail = `${menu.data.length} menu item(s); response matches the expected contract.`
          }
        }
        results.push(menu)
      }
    }
  }
  if (cart.outcome === 'ok') {
    cart.outcome = 'failed'
    cart.detail = 'Cart returned success without a session. Check the backend authentication rules.'
  } else if (cart.outcome === 'auth-required' && cart.status === 403) {
    cart.detail =
      'HTTP 403: reachable, but the session probe requires HTTP 401 or a login redirect. Verify the backend authentication configuration.'
  } else if (cart.outcome === 'auth-required') {
    cart.outcome = 'ok'
    cart.detail = 'Anonymous cart request requires sign-in, as expected by the session probe.'
  }

  // Do not write menu data, cookies, response bodies, or account details to logs.
  return results.map(({ path, outcome, detail }) => ({ path, outcome, detail }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await checkBackend(process.argv[2] || process.env.QUICKBITE_API_URL)
    for (const result of results)
      console.log(`[${result.outcome}] ${result.path}: ${result.detail}`)
    console.log(
      'Read-only check. Login, logout, checkout, database persistence, and AWS deployment are not verified by this command.',
    )
    process.exitCode = results.some((result) => result.outcome === 'failed')
      ? 1
      : results.some((result) => result.outcome === 'auth-required')
        ? 2
        : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
