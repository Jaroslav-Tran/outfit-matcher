import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { data, error: signError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signError) throw signError
        onSignedIn(data.session.user)
        return
      }
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signError) throw signError
      if (data.session?.user) {
        onSignedIn(data.session.user)
        return
      }
      setInfo('Check your email to confirm the account, then sign in.')
    } catch (err) {
      setError(err.message || 'Could not sign in.')
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
        <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
        <p className="lede">
          Use the same email on your laptop and phone. Wardrobe rows are private
          to this login.
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
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {info ? <p className="hint">{info}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError('')
            setInfo('')
          }}
        >
          {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </div>
  )
}
