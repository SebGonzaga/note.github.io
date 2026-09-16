export default function Button({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-card font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const sizes = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3.5 py-2 text-sm',
    icon: 'p-2'
  }

  const variants = {
    default: 'bg-accent text-white hover:opacity-90',
    ghost: 'bg-transparent text-ink hover:bg-accent-soft',
    outline: 'border border-border text-ink hover:bg-accent-soft bg-transparent',
    danger: 'bg-transparent text-red-500 hover:bg-red-500/10'
  }

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
