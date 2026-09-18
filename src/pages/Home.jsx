import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Plus,
  FolderPlus,
  Star,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  FolderInput,
  NotebookText
} from 'lucide-react'
import Modal from '../components/common/Modal.jsx'
import Button from '../components/common/Button.jsx'
import * as store from '../services/storage/notebooks.js'

export default function Home({ filter = 'all' }) {
  const { folders, notebooks, refresh, search } = useOutletContext()
  const navigate = useNavigate()

  const [sortBy, setSortBy] = useState('updated')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [renaming, setRenaming] = useState(null) // { id, title }
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const heading =
    filter === 'recent' ? 'Recent' : filter === 'favorites' ? 'Favorites' : 'Library'

  const visibleNotebooks = useMemo(() => {
    let list = [...notebooks]

    if (filter === 'favorites') list = list.filter((n) => n.favorite)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((n) => n.title.toLowerCase().includes(q))
    }

    list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'created') return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })

    if (filter === 'recent') list = list.slice(0, 12)
    return list
  }, [notebooks, filter, search, sortBy])

  const grouped = useMemo(() => {
    if (filter !== 'all') return null
    const map = new Map(folders.map((f) => [f.id, { folder: f, items: [] }]))
    const unfiled = []
    for (const nb of visibleNotebooks) {
      if (nb.folderId && map.has(nb.folderId)) map.get(nb.folderId).items.push(nb)
      else unfiled.push(nb)
    }
    return { folderGroups: [...map.values()], unfiled }
  }, [folders, visibleNotebooks, filter])

  async function handleCreateNotebook(folderId = null) {
    const notebook = await store.createNotebook({ folderId })
    await refresh()
    navigate(`/notebook/${notebook.id}`)
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    await store.createFolder(newFolderName.trim())
    setNewFolderName('')
    setCreatingFolder(false)
    await refresh()
  }

  async function handleRename() {
    if (!renaming?.title.trim()) return
    await store.renameNotebook(renaming.id, renaming.title.trim())
    setRenaming(null)
    await refresh()
  }

  async function handleDelete(id) {
    await store.deleteNotebook(id)
    setOpenMenuId(null)
    await refresh()
  }

  async function handleDuplicate(id) {
    await store.duplicateNotebook(id)
    setOpenMenuId(null)
    await refresh()
  }

  async function handleFavorite(id) {
    await store.toggleFavorite(id)
    setOpenMenuId(null)
    await refresh()
  }

  async function handleMove(id, folderId) {
    await store.moveNotebook(id, folderId)
    setOpenMenuId(null)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8" onClick={() => setOpenMenuId(null)}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="serif text-2xl font-semibold">{heading}</h1>

        {filter === 'all' && (
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-card border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="updated">Last modified</option>
              <option value="created">Date created</option>
              <option value="title">Title</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => setCreatingFolder(true)}>
              <FolderPlus size={15} />
              New folder
            </Button>
            <Button size="sm" onClick={() => handleCreateNotebook(null)}>
              <Plus size={15} />
              New notebook
            </Button>
          </div>
        )}
      </div>

      {visibleNotebooks.length === 0 && (
        <div className="rounded-card border border-dashed border-border py-16 text-center text-muted">
          <NotebookText className="mx-auto mb-3" size={28} />
          <p className="mb-4 text-sm">
            {filter === 'favorites'
              ? "You haven't favorited any notebooks yet."
              : search
              ? 'No notebooks match your search.'
              : 'Nothing here yet — start a new notebook.'}
          </p>
          {filter === 'all' && !search && (
            <Button size="sm" onClick={() => handleCreateNotebook(null)}>
              <Plus size={15} />
              New notebook
            </Button>
          )}
        </div>
      )}

      {filter !== 'all' && visibleNotebooks.length > 0 && (
        <NotebookGrid
          notebooks={visibleNotebooks}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onOpen={(id) => navigate(`/notebook/${id}`)}
          onRename={(nb) => setRenaming({ id: nb.id, title: nb.title })}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onFavorite={handleFavorite}
          onMove={handleMove}
          folders={folders}
        />
      )}

      {filter === 'all' && grouped && (
        <div className="flex flex-col gap-8">
          {grouped.folderGroups.map(({ folder, items }) => (
            <section key={folder.id}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {folder.name}
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted">No notebooks in this folder yet.</p>
              ) : (
                <NotebookGrid
                  notebooks={items}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onOpen={(id) => navigate(`/notebook/${id}`)}
                  onRename={(nb) => setRenaming({ id: nb.id, title: nb.title })}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onFavorite={handleFavorite}
                  onMove={handleMove}
                  folders={folders}
                />
              )}
            </section>
          ))}

          {grouped.unfiled.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Unfiled
              </h2>
              <NotebookGrid
                notebooks={grouped.unfiled}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onOpen={(id) => navigate(`/notebook/${id}`)}
                onRename={(nb) => setRenaming({ id: nb.id, title: nb.title })}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onFavorite={handleFavorite}
                onMove={handleMove}
                folders={folders}
              />
            </section>
          )}
        </div>
      )}

      {creatingFolder && (
        <Modal
          title="New folder"
          onClose={() => setCreatingFolder(false)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setCreatingFolder(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateFolder}>
                Create
              </Button>
            </>
          }
        >
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name"
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </Modal>
      )}

      {renaming && (
        <Modal
          title="Rename notebook"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRename}>
                Save
              </Button>
            </>
          }
        >
          <input
            autoFocus
            value={renaming.title}
            onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none"
          />
        </Modal>
      )}
    </div>
  )
}

function NotebookGrid({
  notebooks,
  openMenuId,
  setOpenMenuId,
  onOpen,
  onRename,
  onDelete,
  onDuplicate,
  onFavorite,
  onMove,
  folders
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {notebooks.map((nb) => (
        <div
          key={nb.id}
          className="group relative cursor-pointer rounded-card border border-border bg-surface p-3 transition-shadow hover:shadow-md"
          onClick={() => onOpen(nb.id)}
        >
          <div className="mb-3 flex aspect-[4/5] items-center justify-center rounded-card bg-paper text-muted">
            <NotebookText size={26} />
          </div>

          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{nb.title}</p>
              <p className="text-xs text-muted">
                {new Date(nb.updatedAt).toLocaleDateString()}
              </p>
            </div>

            <button
              aria-label="Notebook actions"
              onClick={(e) => {
                e.stopPropagation()
                setOpenMenuId(openMenuId === nb.id ? null : nb.id)
              }}
              className="rounded-card p-1 text-muted opacity-100 hover:bg-accent-soft sm:opacity-0 sm:group-hover:opacity-100"
            >
              <MoreVertical size={15} />
            </button>
          </div>

          {nb.favorite && (
            <Star size={13} className="absolute right-3 top-3 fill-accent text-accent" />
          )}

          {openMenuId === nb.id && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-12 z-10 w-44 rounded-card border border-border bg-surface py-1 shadow-lg"
            >
              <MenuItem icon={<Pencil size={14} />} label="Rename" onClick={() => onRename(nb)} />
              <MenuItem
                icon={<Star size={14} />}
                label={nb.favorite ? 'Unfavorite' : 'Favorite'}
                onClick={() => onFavorite(nb.id)}
              />
              <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={() => onDuplicate(nb.id)} />
              {folders.length > 0 && (
                <div className="border-t border-border">
                  <p className="px-3 pt-2 text-xs text-muted">Move to…</p>
                  <MenuItem icon={<FolderInput size={14} />} label="Unfiled" onClick={() => onMove(nb.id, null)} />
                  {folders.map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<FolderInput size={14} />}
                      label={f.name}
                      onClick={() => onMove(nb.id, f.id)}
                    />
                  ))}
                </div>
              )}
              <div className="border-t border-border">
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label="Delete"
                  danger
                  onClick={() => onDelete(nb.id)}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent-soft ${
        danger ? 'text-red-500' : 'text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
