import { NavLink } from 'react-router-dom'
import { BookOpen, Clock, Star, Settings, FolderClosed, NotebookText, FileText, Layers, ListChecks } from 'lucide-react'

export default function Sidebar({ folders, notebooks, documents = [] }) {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-card px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-accent-soft hover:text-ink'
    }`

  const notebooksInFolder = (folderId) => notebooks.filter((n) => n.folderId === folderId)
  const unfiled = notebooks.filter((n) => !n.folderId)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-card bg-accent text-white">
          <BookOpen size={16} />
        </div>
        <span className="serif text-lg font-semibold">Inkwell</span>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        <NavLink to="/" end className={linkClass}>
          <NotebookText size={16} />
          Library
        </NavLink>
        <NavLink to="/recent" className={linkClass}>
          <Clock size={16} />
          Recent
        </NavLink>
        <NavLink to="/favorites" className={linkClass}>
          <Star size={16} />
          Favorites
        </NavLink>
        <NavLink to="/documents" className={linkClass}>
          <FileText size={16} />
          Documents
          {documents.length > 0 && (
            <span className="ml-auto text-xs text-muted">{documents.length}</span>
          )}
        </NavLink>
        <NavLink to="/flashcards" className={linkClass}>
          <Layers size={16} />
          Flashcards
        </NavLink>
        <NavLink to="/quizzes" className={linkClass}>
          <ListChecks size={16} />
          Quizzes
        </NavLink>
      </nav>

      <div className="mt-4 flex-1 overflow-y-auto px-2">
        {folders.map((folder) => (
          <div key={folder.id} className="mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <FolderClosed size={13} />
              {folder.name}
            </div>
            {notebooksInFolder(folder.id).map((nb) => (
              <NavLink
                key={nb.id}
                to={`/notebook/${nb.id}`}
                className={linkClass}
              >
                <span className="truncate pl-5">{nb.title}</span>
              </NavLink>
            ))}
          </div>
        ))}

        {unfiled.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Unfiled
            </div>
            {unfiled.map((nb) => (
              <NavLink key={nb.id} to={`/notebook/${nb.id}`} className={linkClass}>
                <span className="truncate pl-5">{nb.title}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-2 py-2">
        <NavLink to="/settings" className={linkClass}>
          <Settings size={16} />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
