import { useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Upload, FileText, MoreVertical, Pencil, Trash2, Star, Loader2 } from 'lucide-react'
import Modal from '../components/common/Modal.jsx'
import Button from '../components/common/Button.jsx'
import { loadPdf } from '../services/pdf/pdfjs.js'
import * as docStore from '../services/storage/documents.js'

// Upload guardrails: validate file type and size before accepting an
// upload. There's no server-side storage quota to check against — files
// live only in this browser's IndexedDB.
const MAX_SIZE_MB = 50

export default function Documents() {
  const { documents, refreshDocuments, search } = useOutletContext()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [dragging, setDragging] = useState(false)

  const visible = useMemo(() => {
    let list = [...documents]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((d) => d.title.toLowerCase().includes(q))
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [documents, search])

  async function handleFiles(fileList) {
    const file = fileList?.[0]
    if (!file) return
    setUploadError(null)

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('That file isn’t a PDF. Please choose a .pdf file.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`That file is larger than the ${MAX_SIZE_MB} MB limit.`)
      return
    }

    setUploading(true)
    try {
      // Parse before saving, so a corrupt or password-protected file is
      // rejected up front rather than becoming a broken library entry.
      const pdf = await loadPdf(file)
      const doc = await docStore.createDocument({
        title: file.name.replace(/\.pdf$/i, ''),
        file,
        pageCount: pdf.numPages
      })
      await refreshDocuments()
      navigate(`/document/${doc.id}`)
    } catch {
      setUploadError("That PDF couldn't be read. It may be corrupted or password-protected.")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    await docStore.deleteDocument(id)
    setOpenMenuId(null)
    await refreshDocuments()
  }

  async function handleRename() {
    if (!renaming?.title.trim()) return
    await docStore.renameDocument(renaming.id, renaming.title.trim())
    setRenaming(null)
    await refreshDocuments()
  }

  async function handleFavorite(id) {
    await docStore.toggleDocumentFavorite(id)
    setOpenMenuId(null)
    await refreshDocuments()
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8" onClick={() => setOpenMenuId(null)}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="serif text-2xl font-semibold">Documents</h1>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? 'Reading PDF…' : 'Upload PDF'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {uploadError && (
        <div className="mb-4 rounded-card border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {uploadError}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`mb-6 rounded-card border border-dashed px-6 py-8 text-center text-sm transition-colors ${
          dragging ? 'border-accent bg-accent-soft text-ink' : 'border-border text-muted'
        }`}
      >
        <Upload className="mx-auto mb-2" size={22} />
        Drop a PDF here, or use the Upload button. Max {MAX_SIZE_MB} MB.
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-14 text-center text-muted">
          <FileText className="mx-auto mb-3" size={26} />
          <p className="text-sm">
            {search ? 'No documents match your search.' : 'No PDFs yet — upload one to start studying.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((d) => (
            <div
              key={d.id}
              onClick={() => navigate(`/document/${d.id}`)}
              className="group relative cursor-pointer rounded-card border border-border bg-surface p-3 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex aspect-[4/5] items-center justify-center rounded-card bg-paper text-muted">
                <FileText size={26} />
              </div>

              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted">
                    {d.pageCount} page{d.pageCount === 1 ? '' : 's'} · {formatSize(d.size)}
                  </p>
                </div>
                <button
                  aria-label="Document actions"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuId(openMenuId === d.id ? null : d.id)
                  }}
                  className="rounded-card p-1 text-muted opacity-100 hover:bg-accent-soft sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <MoreVertical size={15} />
                </button>
              </div>

              {d.favorite && <Star size={13} className="absolute right-3 top-3 fill-accent text-accent" />}

              {openMenuId === d.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-2 top-12 z-10 w-40 rounded-card border border-border bg-surface py-1 shadow-lg"
                >
                  <MenuItem
                    icon={<Pencil size={14} />}
                    label="Rename"
                    onClick={() => setRenaming({ id: d.id, title: d.title })}
                  />
                  <MenuItem
                    icon={<Star size={14} />}
                    label={d.favorite ? 'Unfavorite' : 'Favorite'}
                    onClick={() => handleFavorite(d.id)}
                  />
                  <div className="border-t border-border">
                    <MenuItem
                      icon={<Trash2 size={14} />}
                      label="Delete"
                      danger
                      onClick={() => handleDelete(d.id)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {renaming && (
        <Modal
          title="Rename document"
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

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
