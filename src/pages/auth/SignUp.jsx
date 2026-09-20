import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import AuthCard from '../../components/auth/AuthCard.jsx'
import Button from '../../components/common/Button.jsx'
import { signUp, signInWithGoogle } from '../../services/auth/authService.js'

const MIN_PASSWORD_LENGTH = 8

export default function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sentEmail, setSentEmail] = useState(false)

  const redirectTo = location.state?.from || '/'

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { session } = await signUp(email, password)
      // If email confirmation is off, signUp() returns an active session
      // immediately; if it's on, there's no session yet and the person
      // needs to confirm via email first (spec §17: email verification).
      if (session) navigate(redirectTo, { replace: true })
      else setSentEmail(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sentEmail) {
    return (
      <AuthCard title="Check your email">
        <div className="flex items-start gap-2 text-sm text-muted">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          <p>
            We sent a confirmation link to <span className="text-ink">{email}</span>. Click it to
            finish creating your account.
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="Notebooks and PDFs work without one — this is for AI features and cloud sync."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="text-accent hover:underline">
            Sign in
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
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
          <span className="text-[11px] text-muted">At least {MIN_PASSWORD_LENGTH} characters.</span>
        </Field>

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Create account
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
