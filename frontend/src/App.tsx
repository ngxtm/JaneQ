import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { getUser, signOut, type User } from './features/auth/api'
import { isUnauthorized } from './http'

const Login = lazy(() => import('./features/auth/Login'))
const Home = lazy(() => import('./features/study-sets/Home'))

type Session =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: User }

function App() {
  const [session, setSession] = useState<Session>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const expireSession = useCallback(() => setSession({ kind: 'signed-out' }), [])

  useEffect(() => {
    const controller = new AbortController()
    getUser(controller.signal).then((user) => {
      if (!controller.signal.aborted) setSession({ kind: 'signed-in', user })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setSession({ kind: isUnauthorized(error) ? 'signed-out' : 'unavailable' })
    })
    return () => controller.abort()
  }, [attempt])

  function retrySession() {
    setSession({ kind: 'checking' })
    setAttempt((current) => current + 1)
  }

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      expireSession()
    } catch {
      setSignOutError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <>
      {session.kind === 'checking' ? <main className="page"><p role="status">Checking your session…</p></main> : null}
      {session.kind === 'unavailable' ? (
        <main className="page">
          <p className="error" role="alert">Could not connect to JaneQ.</p>
          <button className="plain-button" type="button" onClick={retrySession}>Try again</button>
        </main>
      ) : null}
      {session.kind === 'signed-out' ? (
        <Suspense fallback={<main className="page"><p role="status">Loading sign-in…</p></main>}>
          <Login onSignIn={(user) => setSession({ kind: 'signed-in', user })} />
        </Suspense>
      ) : null}
      {session.kind === 'signed-in' ? (
        <Suspense fallback={<main className="page"><p role="status">Loading Home…</p></main>}>
          <Home
            username={session.user.username}
            signingOut={signingOut}
            signOutError={signOutError}
            onSignOut={handleSignOut}
            onSessionExpired={expireSession}
          />
        </Suspense>
      ) : null}
    </>
  )
}

export default App
