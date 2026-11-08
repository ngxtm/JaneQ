import { type SubmitEvent, useState } from 'react'
import { isUnauthorized, signIn, type User } from './api'

type LoginProps = { onSignIn: (user: User) => void }

export default function Login({ onSignIn }: LoginProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const user = await signIn(String(fields.get('username')), String(fields.get('password')))
      onSignIn(user)
    } catch (error) {
      setError(isUnauthorized(error)
        ? 'Incorrect username or password.'
        : 'Could not sign in. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="page login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Sign in to JaneQ</h1>
        <p className="muted">Open your study sets and get ready to practice.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
