import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, isDemoMode } from './api'
import { clearPrivateSession, queryKeys, setSessionTransition } from './queries'
import type { Credentials } from './types'

interface SessionIdentity {
  username: string
  sessionId: string
}

interface SessionContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  isSigningOut: boolean
  username: string | null
  sessionId: string | null
  error: Error | null
  signIn(credentials: Credentials): Promise<void>
  signOut(): Promise<void>
}

type AuthNotification = 'signed-in' | 'signed-out'
const displayNameKey = 'quickbite.display-name.v1'
const sessionIdKey = 'quickbite.session-generation.v1'
const apiScope = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const authScope = `${isDemoMode ? 'demo' : 'live'}:${encodeURIComponent(apiScope)}`
const authChannelName = `quickbite.auth.v1:${authScope}`
const authRevisionKey = `${authChannelName}:revision`
const seenAuthRevisionKey = `${authChannelName}:seen-revision`
const storedAuthScopeKey = 'quickbite.auth-scope.v1'
const SessionContext = createContext<SessionContextValue | null>(null)
let memorySessionId: string | null = null

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

function clearSessionId(): void {
  memorySessionId = null
  try {
    sessionStorage.removeItem(sessionIdKey)
  } catch {
    // A memory-only generation still protects receipts when storage is unavailable.
  }
}

function verifiedSessionId(fresh = false): string {
  let stored = memorySessionId
  try {
    stored = sessionStorage.getItem(sessionIdKey)
  } catch {
    // Only call this after the server has confirmed the session.
  }
  const id = !fresh && stored ? stored : crypto.randomUUID()
  memorySessionId = id
  try {
    sessionStorage.setItem(sessionIdKey, id)
  } catch {
    // This identifier is a local account generation, never proof of authentication.
  }
  return id
}

function currentAuthRevision(): string | null {
  if (isDemoMode) return null
  try {
    return localStorage.getItem(authRevisionKey)
  } catch {
    return null
  }
}

function acknowledgeAuthRevision(revision = currentAuthRevision()): void {
  if (isDemoMode) return
  try {
    if (revision) sessionStorage.setItem(seenAuthRevisionKey, revision)
    else sessionStorage.removeItem(seenAuthRevisionKey)
    sessionStorage.setItem(storedAuthScopeKey, authScope)
  } catch {
    // BroadcastChannel still covers active tabs when storage is unavailable.
  }
}

function reconcileAuthRevision(): boolean {
  if (isDemoMode) return false
  try {
    const revision = localStorage.getItem(authRevisionKey)
    const seen = sessionStorage.getItem(seenAuthRevisionKey)
    const previousScope = sessionStorage.getItem(storedAuthScopeKey)
    const changed = revision !== seen || Boolean(previousScope && previousScope !== authScope)
    if (changed) {
      rememberDisplayName(null)
      clearSessionId()
      acknowledgeAuthRevision(revision)
    }
    return changed
  } catch {
    return false
  }
}

function publishAuthRevision(): void {
  if (isDemoMode) return
  try {
    const revision = crypto.randomUUID()
    localStorage.setItem(authRevisionKey, revision)
    acknowledgeAuthRevision(revision)
  } catch {
    // This optional shared marker contains no username, password, or server token.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const authentication = useRef({ attempt: 0, inProgress: false })
  const signOutPromise = useRef<Promise<void> | null>(null)
  const authChannel = useRef<BroadcastChannel | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const session = useQuery<SessionIdentity | null>({
    queryKey: queryKeys.session,
    queryFn: async ({ signal }) => {
      if (authentication.current.inProgress) {
        return client.getQueryData<SessionIdentity | null>(queryKeys.session) || null
      }
      const discardUnverifiedIdentity = () => {
        rememberDisplayName(null)
        clearSessionId()
        void client.cancelQueries({ queryKey: queryKeys.cart })
        client.removeQueries({ queryKey: queryKeys.cart })
        // Clear an existing identity without making an unverified result look fresh.
        // StrictMode can cancel this probe and remount its observer before it completes.
        if (client.getQueryData(queryKeys.session) !== undefined) {
          client.setQueryData(queryKeys.session, null, { updatedAt: 0 })
        }
      }
      if (reconcileAuthRevision()) discardUnverifiedIdentity()
      const revision = currentAuthRevision()
      const attempt = authentication.current.attempt
      try {
        const cart = await api.getCart()
        // A request can complete after React Query canceled its original observer.
        signal.throwIfAborted()
        if (attempt !== authentication.current.attempt) {
          throw new DOMException('Session check canceled.', 'AbortError')
        }
        if (revision !== currentAuthRevision()) {
          reconcileAuthRevision()
          discardUnverifiedIdentity()
          throw new ApiError(
            'Your account changed in another tab. Please refresh and try again.',
            409,
          )
        }
        acknowledgeAuthRevision(revision)
        client.setQueryData(queryKeys.cart, cart)
        return { username: readDisplayName(), sessionId: verifiedSessionId() }
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof ApiError && error.status === 401) {
          void client.cancelQueries({ queryKey: queryKeys.cart })
          client.removeQueries({ queryKey: queryKeys.cart })
          rememberDisplayName(null)
          clearSessionId()
          return null
        }
        throw error
      }
    },
    enabled: !isSigningOut,
    retry: false,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (session.data === null && client.getQueryData(queryKeys.session) === null) {
      rememberDisplayName(null)
      clearSessionId()
    }
  }, [client, session.data])

  useEffect(() => {
    // Live tabs share the backend cookie. Demo sessions are intentionally tab-local.
    if (isDemoMode) return
    const replaceAccount = (revalidate: boolean) => {
      authentication.current.attempt += 1
      const attempt = authentication.current.attempt
      authentication.current.inProgress = false
      setSessionTransition(client, false)
      setIsSigningOut(false)
      rememberDisplayName(null)
      clearSessionId()
      acknowledgeAuthRevision()
      void clearPrivateSession(client).then(() => {
        // No /me endpoint is available in the known client contract; discard the old name.
        if (revalidate && authentication.current.attempt === attempt) {
          void client.invalidateQueries({ queryKey: queryKeys.session })
        }
      })
    }
    const checkResumedTab = () => {
      if (document.visibilityState !== 'hidden' && reconcileAuthRevision()) replaceAccount(true)
    }
    window.addEventListener('focus', checkResumedTab)
    document.addEventListener('visibilitychange', checkResumedTab)
    let channel: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(authChannelName)
        authChannel.current = channel
        channel.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data === 'signed-in' || event.data === 'signed-out') {
            replaceAccount(event.data === 'signed-in')
          }
        }
      } catch {
        // Foreground checks still detect missed boundaries when storage is available.
      }
    }
    return () => {
      window.removeEventListener('focus', checkResumedTab)
      document.removeEventListener('visibilitychange', checkResumedTab)
      channel?.close()
      if (authChannel.current === channel) authChannel.current = null
    }
  }, [client])

  const notifyOtherTabs = useCallback((notification: AuthNotification) => {
    publishAuthRevision()
    try {
      authChannel.current?.postMessage(notification)
    } catch {
      // Cross-tab notification is optional in browsers that restrict messaging.
    }
  }, [])

  const signIn = useCallback(
    async (credentials: Credentials) => {
      if (signOutPromise.current) throw new ApiError('Please wait until sign-out finishes.', 409)
      const attempt = ++authentication.current.attempt
      authentication.current.inProgress = true
      setSessionTransition(client, true)
      rememberDisplayName(null)
      clearSessionId()
      const assertCurrentAttempt = () => {
        if (attempt !== authentication.current.attempt)
          throw new DOMException('Sign-in canceled.', 'AbortError')
      }
      try {
        await clearPrivateSession(client)
        assertCurrentAttempt()
        await api.login(credentials)
        assertCurrentAttempt()
        const cart = await api.getCart()
        assertCurrentAttempt()
        await client.cancelQueries({ queryKey: queryKeys.session })
        assertCurrentAttempt()
        rememberDisplayName(credentials.username)
        const identity = { username: credentials.username, sessionId: verifiedSessionId(true) }
        client.setQueryData(queryKeys.cart, cart)
        client.setQueryData<SessionIdentity>(queryKeys.session, identity)
        notifyOtherTabs('signed-in')
      } catch (error) {
        if (attempt === authentication.current.attempt) {
          rememberDisplayName(null)
          clearSessionId()
          await clearPrivateSession(client)
        }
        throw error
      } finally {
        if (attempt === authentication.current.attempt) {
          authentication.current.inProgress = false
          setSessionTransition(client, false)
        }
      }
    },
    [client, notifyOtherTabs],
  )

  const signOut = useCallback((): Promise<void> => {
    if (signOutPromise.current) return signOutPromise.current
    if (authentication.current.inProgress) {
      return Promise.reject(new ApiError('Please wait until sign-in finishes.', 409))
    }
    const attempt = ++authentication.current.attempt
    authentication.current.inProgress = true
    setSessionTransition(client, true)
    setIsSigningOut(true)
    const assertCurrentAttempt = () => {
      if (attempt !== authentication.current.attempt)
        throw new DOMException('Sign-out canceled by an account change.', 'AbortError')
    }
    const operation = (async () => {
      // Keep the existing identity and cached cart until server logout is confirmed.
      await Promise.all([
        client.cancelQueries({ queryKey: queryKeys.session }),
        client.cancelQueries({ queryKey: queryKeys.cart }),
      ])
      assertCurrentAttempt()
      await api.logout()
      assertCurrentAttempt()
      try {
        // This bypasses React Query and the browser cache to verify the actual cookie.
        await api.getCart()
      } catch (error) {
        assertCurrentAttempt()
        if (!(error instanceof ApiError && error.status === 401)) throw error
        rememberDisplayName(null)
        clearSessionId()
        await clearPrivateSession(client)
        assertCurrentAttempt()
        notifyOtherTabs('signed-out')
        return
      }
      assertCurrentAttempt()
      throw new ApiError('Your session is still active. Please try signing out again.', 409)
    })()
    const tracked = operation.finally(() => {
      if (signOutPromise.current === tracked) signOutPromise.current = null
      if (attempt === authentication.current.attempt) {
        authentication.current.inProgress = false
        setSessionTransition(client, false)
        setIsSigningOut(false)
      }
    })
    signOutPromise.current = tracked
    return tracked
  }, [client, notifyOtherTabs])

  return (
    <SessionContext.Provider
      value={{
        isAuthenticated: Boolean(session.data),
        isLoading: session.isPending,
        isSigningOut,
        username: session.data?.username || null,
        sessionId: session.data?.sessionId || null,
        error: session.error,
        signIn,
        signOut,
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
