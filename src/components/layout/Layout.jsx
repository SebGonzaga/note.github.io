import { Outlet } from 'react-router-dom'
import { Moon, Sun, Search } from 'lucide-react'
import Sidebar from '../sidebar/Sidebar.jsx'

export default function Layout({ folders, notebooks, documents, theme, toggleTheme, search, setSearch, context }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar folders={folders} notebooks={notebooks} documents={documents} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notebooks, pages, flashcards…"
              className="w-full rounded-card border border-border bg-paper py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-muted"
            />
          </div>

          <div className="flex-1" />

          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="rounded-card border border-border p-2 text-muted hover:bg-accent-soft hover:text-ink"
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
