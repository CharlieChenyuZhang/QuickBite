import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createMockServer } from './server.mjs'

const port = Number(process.env.QUICKBITE_PORT || 5173)
const apiPort = Number(process.env.QUICKBITE_MOCK_API_PORT || 8787)
for (const value of [port, apiPort]) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('Local ports must be integers between 1 and 65535.')
  }
}

let mock
let vite
let stopping = false
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  await Promise.allSettled([vite?.close(), mock?.close()])
  process.exitCode = code
}

process.once('SIGINT', () => {
  void stop()
})
process.once('SIGTERM', () => {
  void stop()
})

async function closeIfCancelled() {
  if (!stopping) return false
  await Promise.allSettled([vite?.close(), mock?.close()])
  return true
}

async function start() {
  mock = await createMockServer({ port: apiPort })
  if (await closeIfCancelled()) return
  // Use the actual fetch/cookie-session client against a local HTTP mock server.
  process.env.VITE_DEMO_MODE = 'false'
  process.env.VITE_API_BASE_URL = '/api'
  process.env.VITE_LOGOUT_PATH = '/logout'
  process.env.API_PROXY_TARGET = mock.origin
  vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    mode: 'mock',
    server: { host: '127.0.0.1', port, strictPort: true },
  })
  if (await closeIfCancelled()) return
  await vite.listen()
  if (await closeIfCancelled()) return
  console.log(`QuickBite local testing: http://localhost:${port}/`)
  console.log(`Mock API: ${mock.origin}. Data resets when this command restarts.`)
  console.log('Test accounts and reset instructions: testing data/README.md')
}

try {
  await start()
} catch (error) {
  if (!stopping) {
    console.error(`Could not start local testing: ${error.message}`)
    await stop(1)
  } else {
    await closeIfCancelled()
  }
}
