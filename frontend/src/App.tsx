import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { getUser, signOut, type User } from './features/auth/api'
import { isUnauthorized } from './http'

const Login = lazy(() => import('./features/auth/Login'))
const SessionUnavailable = lazy(() => import('./features/auth/SessionUnavailable'))
const Home = lazy(() => import('./features/study-sets/Home'))

type Session =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: User; signOut: 'idle' | 'pending' | 'error' }

function App() {
  const [session, setSession] = useState<Session>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const signOutRequest = useRef<AbortController | null>(null)
  const startSession = useCallback((user: User) => {
    setSession({ kind: 'signed-in', user, signOut: 'idle' })
  }, [])
  const expireSession = useCallback(() => {
    // Cancel the cookie-clearing request before another sign-in can begin.
    signOutRequest.current?.abort()
    setSession({ kind: 'signed-out' })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getUser(controller.signal).then((user) => {
      if (!controller.signal.aborted) startSession(user)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setSession({ kind: isUnauthorized(error) ? 'signed-out' : 'unavailable' })
    })
    return () => controller.abort()
  }, [attempt, startSession])

  useEffect(() => () => signOutRequest.current?.abort(), [])

  function retrySession() {
    setSession({ kind: 'checking' })
    setAttempt((current) => current + 1)
  }

  async function handleSignOut() {
    if (session.kind !== 'signed-in' || signOutRequest.current) return

    const controller = new AbortController()
    signOutRequest.current = controller
    setSession({ ...session, signOut: 'pending' })
    try {
      await signOut(controller.signal)
      if (!controller.signal.aborted) setSession({ kind: 'signed-out' })
    } catch {
      if (!controller.signal.aborted) setSession({ ...session, signOut: 'error' })
    } finally {
      signOutRequest.current = null
    }
  }

  return (
    <>
      {session.kind === 'unavailable' ? (
        <Suspense fallback={null}>
          <SessionUnavailable onRetry={retrySession} />
        </Suspense>
      ) : null}
      {session.kind === 'signed-out' ? (
        <Suspense fallback={null}>
          <Login onSignIn={startSession} />
        </Suspense>
      ) : null}
      {session.kind === 'signed-in' ? (
        <Suspense fallback={null}>
          <Home
            username={session.user.username}
            signingOut={session.signOut === 'pending'}
            signOutError={session.signOut === 'error' ? 'Could not sign out. Please try again.' : ''}
            onSignOut={handleSignOut}
            onSessionExpired={expireSession}
          />
        </Suspense>
      ) : null}
    </>
  )
}

export default App
