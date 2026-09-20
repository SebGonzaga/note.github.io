import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import AuthCard from '../../components/auth/AuthCard.jsx'
import Button from '../../components/common/Button.jsx'
import { updatePassword } from '../../services/auth/authService.js'
import { useAuth } from '../../hooks/useAuth.js'

const MIN_PASSWORD_LENGTH = 8
// The recovery link's one-time code is exchanged for a session
// automatically (client.js has detectSessionInUrl: true) — that happens
// asynchronously right after this page mounts, so there's a brief window
// where useAuth() correctly reports "not signed in yet" even for a valid
// link. Only treat the link as actually invalid/expired after waiting a
// bit for that exchange to finish.
const RECOVERY_TIMEOUT_MS = 5000

export default function ResetPassword() {
  const navigate = useNavigate()
  const { isSignedIn, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (isSignedIn) return
    const timer = setTimeout(() => setTimedOut(true), RECOVERY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isSignedIn])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <div className="flex items-start gap-2 text-sm text-muted">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          <p>Taking you to your library…</p>
        </div>
      </AuthCard>
    )
  }

  if (!loading && !isSignedIn && timedOut) {
    return (
      <AuthCard
        title="Link expired"
        footer={
          <Link to="/forgot-password" className="text-accent hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-muted">
          This password reset link is invalid or has expired. Request a new one to continue.
        </p>
      </AuthCard>
    )
  }

  if (loading || !isSignedIn) {
    return (
      <AuthCard title="Verifying your link…">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> One moment.
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set a new password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">New password</span>
          <input
            type="password"
            required
            autoFocus
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" disabled={saving} className="mt-1 w-full">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Update password
        </Button>
      </form>
    </AuthCard>
  )
}
