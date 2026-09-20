import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import AuthCard from '../../components/auth/AuthCard.jsx'
import Button from '../../components/common/Button.jsx'
import { requestPasswordReset } from '../../services/auth/authService.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="flex items-start gap-2 text-sm text-muted">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          <p>
            If an account exists for <span className="text-ink">{email}</span>, we sent a link to
            reset your password.
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link to="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Send reset link
        </Button>
      </form>
    </AuthCard>
  )
}
