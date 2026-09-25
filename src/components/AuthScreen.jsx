import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

function authErrorMessage(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (
    text.includes('signup') ||
    text.includes('sign-up') ||
    text.includes('sign up') ||
    text.includes('signups not allowed')
  ) {
    return 'Sign-ups are currently closed.'
  }
  return error?.message || 'Could not sign in.'
}

export default function AuthScreen({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signError) throw signError
      onSignedIn(data.session.user)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Supabase · laptop and phone</p>
          <h1>Outfit Matcher</h1>
        </div>
      </header>
      <section className="panel">
        <h2>Sign in</h2>
        <p className="lede">
          Use the same email on your laptop and phone. New accounts are closed;
          sign-in still works for the existing user.
        </p>
        <form className="stack form-card" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  )
}
