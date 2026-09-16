// Minimal promise-based IndexedDB wrapper.
// Kept dependency-free so the app has zero runtime cost for local-first storage.

const DB_NAME = 'inkwell-study-notebook'
const DB_VERSION = 2

export const STORES = {
  folders: 'folders',
  notebooks: 'notebooks',
  pages: 'pages',
  documents: 'documents',
  files: 'files',
  pdfAnnotations: 'pdfAnnotations'
}

let dbPromise = null

export function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains(STORES.folders)) {
        db.createObjectStore(STORES.folders, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.notebooks)) {
        const notebooks = db.createObjectStore(STORES.notebooks, { keyPath: 'id' })
        notebooks.createIndex('folderId', 'folderId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.pages)) {
        const pages = db.createObjectStore(STORES.pages, { keyPath: 'id' })
        pages.createIndex('notebookId', 'notebookId', { unique: false })
      }
      // Phase 4 — PDF study system. Documents hold metadata only; the raw
      // PDF bytes live in their own store (`files`) so listing/renaming a
      // document never has to touch the (potentially large) file blob.
      // Annotations are one row per (documentId, pageNumber), mirroring how
      // notebook pages hold their own `elements` array.
      if (!db.objectStoreNames.contains(STORES.documents)) {
        db.createObjectStore(STORES.documents, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.files)) {
        db.createObjectStore(STORES.files, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.pdfAnnotations)) {
        const annotations = db.createObjectStore(STORES.pdfAnnotations, { keyPath: 'id' })
        annotations.createIndex('documentId', 'documentId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName))
}

export async function getAll(storeName) {
  const store = await tx(storeName, 'readonly')
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getById(storeName, id) {
  const store = await tx(storeName, 'readonly')
  return new Promise((resolve, reject) => {
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getByIndex(storeName, indexName, value) {
  const store = await tx(storeName, 'readonly')
  return new Promise((resolve, reject) => {
    const req = store.index(indexName).getAll(value)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(value)
    req.onsuccess = () => resolve(value)
    req.onerror = () => reject(req.error)
  })
}

export async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
