import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Moon, Sun, Search, Menu } from 'lucide-react'
import Sidebar from '../sidebar/Sidebar.jsx'

export default function Layout({ folders, notebooks, documents, theme, toggleTheme, search, setSearch, context }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Below `md` the sidebar is an off-canvas drawer rather than a permanent
  // 256px column — on a ~375px phone that column alone was most of the
  // screen. Close it automatically whenever the route changes, so picking a
  // notebook from the drawer doesn't leave the drawer open over it.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar folders={folders} notebooks={notebooks} documents={documents} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-3 sm:gap-3 sm:px-5">
          <button
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 rounded-card p-2 text-muted hover:bg-accent-soft hover:text-ink md:hidden"
          >
            <Menu size={18} />
          </button>

          <div className="relative min-w-0 flex-1 sm:max-w-sm sm:flex-initial">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notebooks, pages…"
              className="w-full rounded-card border border-border bg-paper py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-muted"
            />
          </div>

          <div className="flex-1" />

          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="shrink-0 rounded-card border border-border p-2 text-muted hover:bg-accent-soft hover:text-ink"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-paper">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  )
}
