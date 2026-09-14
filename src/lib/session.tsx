import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, isDemoMode } from './api'
import { forgetDemoSession } from './demo'
import { clearPrivateSession, queryKeys } from './queries'
import type { Credentials } from './types'

interface SessionIdentity {
  username: string
}

interface SessionContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  username: string | null
  error: Error | null
  signIn(credentials: Credentials): Promise<void>
  forgetSession(): void
}

const displayNameKey = 'quickbite.display-name.v1'
const SessionContext = createContext<SessionContextValue | null>(null)

function readDisplayName(): string {
  try {
    return sessionStorage.getItem(displayNameKey) || 'Food lover'
  } catch {
    return 'Food lover'
  }
}

function rememberDisplayName(username: string | null): void {
  try {
    if (username) sessionStorage.setItem(displayNameKey, username)
    else sessionStorage.removeItem(displayNameKey)
  } catch {
    // The server cookie, not browser storage, determines authentication.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const authentication = useRef({ attempt: 0, inProgress: false })
  const session = useQuery<SessionIdentity | null>({
    queryKey: queryKeys.session,
    queryFn: async ({ signal }) => {
      if (authentication.current.inProgress) return null
      const attempt = authentication.current.attempt
      try {
        const cart = await api.getCart()
        // api.getCart may finish after React Query has canceled this request.
        signal.throwIfAborted()
        if (attempt !== authentication.current.attempt)
          throw new DOMException('Session check canceled.', 'AbortError')
        client.setQueryData(queryKeys.cart, cart)
        return { username: readDisplayName() }
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof ApiError && error.status === 401) {
          // Do not cancel this session query from inside its own query function.
          void client.cancelQueries({ queryKey: queryKeys.cart })
          client.removeQueries({ queryKey: queryKeys.cart })
          return null
        }
        throw error
      }
    },
    retry: false,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (session.data === null && client.getQueryData(queryKeys.session) === null) {
      rememberDisplayName(null)
    }
  }, [client, session.data])

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const attempt = ++authentication.current.attempt
      authentication.current.inProgress = true
      rememberDisplayName(null)
      const assertCurrentAttempt = () => {
        if (attempt !== authentication.current.attempt)
          throw new DOMException('Sign-in canceled.', 'AbortError')
      }
      try {
        await clearPrivateSession(client)
        assertCurrentAttempt()
        await api.login(credentials)
        assertCurrentAttempt()
        // A successful form response can be an HTML redirect. Verify the actual cookie session.
        const cart = await api.getCart()
        assertCurrentAttempt()
        rememberDisplayName(credentials.username)
        client.setQueryData(queryKeys.cart, cart)
        client.setQueryData<SessionIdentity>(queryKeys.session, { username: credentials.username })
      } catch (error) {
        if (attempt === authentication.current.attempt) {
          rememberDisplayName(null)
          await clearPrivateSession(client)
        }
        throw error
      } finally {
        if (attempt === authentication.current.attempt) authentication.current.inProgress = false
      }
    },
    [client],
  )

  const forgetSession = useCallback(() => {
    authentication.current.attempt += 1
    authentication.current.inProgress = false
    rememberDisplayName(null)
    if (isDemoMode) forgetDemoSession()
    void clearPrivateSession(client)
    // The existing backend has no logout endpoint. This only clears client state.
  }, [client])

  return (
    <SessionContext.Provider
      value={{
        isAuthenticated: Boolean(session.data),
        isLoading: session.isPending,
        username: session.data?.username || null,
        error: session.error,
        signIn,
        forgetSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider.')
  return context
}
