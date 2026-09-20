import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import AuthCard from '../../components/auth/AuthCard.jsx'
import Button from '../../components/common/Button.jsx'
import { signIn, signInWithGoogle } from '../../services/auth/authService.js'
import { isSupabaseConfigured } from '../../services/supabase/client.js'

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Sent here from a gated AI action ("sign in to use AI features") — once
  // signed in, return to whatever they were trying to do rather than
  // dropping them at the library.
  const redirectTo = location.state?.from || '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthCard title="Accounts aren't set up yet">
        <p className="text-sm text-muted">
          This deployment doesn't have Supabase configured. Notebooks, PDFs, and annotations all
          work without an account — accounts are only needed for AI features and cloud sync.
        </p>
        <Link to="/" className="mt-4 block text-center text-sm text-accent hover:underline">
          Back to your library
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Sign in to use AI features and sync across devices."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" state={location.state} className="text-accent hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Email">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </Field>

        <Link to="/forgot-password" className="text-right text-xs text-accent hover:underline">
          Forgot password?
        </Link>

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Sign in
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => signInWithGoogle().catch((err) => setError(err.message))}
      >
        Continue with Google
      </Button>
    </AuthCard>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
