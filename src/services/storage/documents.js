import { STORES, getAll, getById, getByIndex, put, remove, newId } from './db.js'

// ---------- Documents (metadata) ----------

export async function listDocuments() {
  return getAll(STORES.documents)
}

export async function getDocument(id) {
  return getById(STORES.documents, id)
}

// `file` is the raw uploaded File/Blob. Stored separately in STORES.files so
// listing documents never has to load PDF bytes into memory.
export async function createDocument({ title, file, pageCount }) {
  const now = Date.now()
  const doc = {
    id: newId('doc'),
    title,
    pageCount,
    size: file.size,
    createdAt: now,
    updatedAt: now,
    favorite: false
  }
  await put(STORES.documents, doc)
  await put(STORES.files, { id: doc.id, blob: file })
  return doc
}

export async function renameDocument(id, title) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return null
  doc.title = title
  doc.updatedAt = Date.now()
  return put(STORES.documents, doc)
}

export async function toggleDocumentFavorite(id) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return null
  doc.favorite = !doc.favorite
  return put(STORES.documents, doc)
}

// Deletion removes the metadata row, the stored file blob, and every
// per-page annotation row — no orphaned data left behind, matching the
// "don't leave private files accessible" rule from the spec.
export async function deleteDocument(id) {
  await remove(STORES.documents, id)
  await remove(STORES.files, id)
  const annotations = await getByIndex(STORES.pdfAnnotations, 'documentId', id)
  await Promise.all(annotations.map((a) => remove(STORES.pdfAnnotations, a.id)))
  return true
}

export async function getDocumentFile(id) {
  const record = await getById(STORES.files, id)
  return record?.blob ?? null
}

async function touchDocument(id) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return
  doc.updatedAt = Date.now()
  await put(STORES.documents, doc)
}

// ---------- Per-page annotations ----------
// One row per (documentId, pageNumber); `elements` holds the same stroke /
// text / image / highlight element shapes used elsewhere, so DrawingCanvas
// and ElementsLayer work unmodified on top of a rendered PDF page.

export async function getPageAnnotations(documentId, pageNumber) {
  const rows = await getByIndex(STORES.pdfAnnotations, 'documentId', documentId)
  return rows.find((r) => r.pageNumber === pageNumber)?.elements ?? []
}

export async function setPageAnnotations(documentId, pageNumber, elements) {
  const rows = await getByIndex(STORES.pdfAnnotations, 'documentId', documentId)
  const existing = rows.find((r) => r.pageNumber === pageNumber)
  const row = existing ? { ...existing, elements } : { id: newId('ann'), documentId, pageNumber, elements }
  await put(STORES.pdfAnnotations, row)
  await touchDocument(documentId)
  return row
}
