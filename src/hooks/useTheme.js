import { useEffect, useState } from 'react'

const STORAGE_KEY = 'inkwell-theme'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggleTheme }
}
