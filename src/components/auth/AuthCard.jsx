import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-ink">
          <BookOpen size={20} />
          <span className="serif text-lg font-semibold">Inkwell</span>
        </Link>

        <div className="rounded-card border border-border bg-surface p-6 shadow-sm">
          <h1 className="serif mb-1 text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mb-5 text-sm text-muted">{subtitle}</p>}
          {children}
        </div>

        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  )
}
