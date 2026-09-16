import { STORES, getAll, getById, getByIndex, put, remove, newId } from './db.js'

// ---------- Folders ----------

export async function listFolders() {
  return getAll(STORES.folders)
}

export async function createFolder(name) {
  const folder = { id: newId('folder'), name, createdAt: Date.now() }
  return put(STORES.folders, folder)
}

export async function renameFolder(id, name) {
  const folder = await getById(STORES.folders, id)
  if (!folder) return null
  folder.name = name
  return put(STORES.folders, folder)
}

export async function deleteFolder(id) {
  // Notebooks inside move to "unfiled" rather than being deleted.
  const notebooks = await getByIndex(STORES.notebooks, 'folderId', id)
  await Promise.all(notebooks.map((n) => put(STORES.notebooks, { ...n, folderId: null })))
  return remove(STORES.folders, id)
}

// ---------- Notebooks ----------

export async function listNotebooks() {
  return getAll(STORES.notebooks)
}

export async function getNotebook(id) {
  return getById(STORES.notebooks, id)
}

export async function createNotebook({ title = 'Untitled notebook', folderId = null } = {}) {
  const now = Date.now()
  const notebook = {
    id: newId('nb'),
    title,
    folderId,
    createdAt: now,
    updatedAt: now,
    favorite: false
  }
  await put(STORES.notebooks, notebook)

  // Every notebook starts with one page.
  await createPage(notebook.id, { title: 'Page 1' })

  return notebook
}

export async function renameNotebook(id, title) {
  const notebook = await getById(STORES.notebooks, id)
  if (!notebook) return null
  notebook.title = title
  notebook.updatedAt = Date.now()
  return put(STORES.notebooks, notebook)
}

export async function toggleFavorite(id) {
  const notebook = await getById(STORES.notebooks, id)
  if (!notebook) return null
  notebook.favorite = !notebook.favorite
  return put(STORES.notebooks, notebook)
}

export async function moveNotebook(id, folderId) {
  const notebook = await getById(STORES.notebooks, id)
  if (!notebook) return null
  notebook.folderId = folderId
  notebook.updatedAt = Date.now()
  return put(STORES.notebooks, notebook)
}

export async function deleteNotebook(id) {
  const pages = await getByIndex(STORES.pages, 'notebookId', id)
  await Promise.all(pages.map((p) => remove(STORES.pages, p.id)))
  return remove(STORES.notebooks, id)
}

export async function duplicateNotebook(id) {
  const original = await getById(STORES.notebooks, id)
  if (!original) return null

  const copy = {
    ...original,
    id: newId('nb'),
    title: `${original.title} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  await put(STORES.notebooks, copy)

  const pages = await getByIndex(STORES.pages, 'notebookId', id)
  const sorted = pages.sort((a, b) => a.order - b.order)
  await Promise.all(
    sorted.map((p) =>
      put(STORES.pages, { ...p, id: newId('page'), notebookId: copy.id })
    )
  )

  return copy
}

// ---------- Pages ----------

export async function listPages(notebookId) {
  const pages = await getByIndex(STORES.pages, 'notebookId', notebookId)
  return pages.sort((a, b) => a.order - b.order)
}

export async function createPage(notebookId, { title, background = 'blank' } = {}) {
  const existing = await listPages(notebookId)
  const page = {
    id: newId('page'),
    notebookId,
    title: title || `Page ${existing.length + 1}`,
    background,
    order: existing.length,
    elements: []
  }
  await put(STORES.pages, page)
  await touchNotebook(notebookId)
  return page
}

export async function renamePage(id, title) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  page.title = title
  await put(STORES.pages, page)
  await touchNotebook(page.notebookId)
  return page
}

export async function setPageBackground(id, background) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  page.background = background
  await put(STORES.pages, page)
  await touchNotebook(page.notebookId)
  return page
}

// Persists the full elements array for a page (strokes today; text/image/
// shape elements arrive in Phase 3 and will live in the same array).
export async function setPageElements(id, elements) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  page.elements = elements
  await put(STORES.pages, page)
  await touchNotebook(page.notebookId)
  return page
}

export async function deletePage(id) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  await remove(STORES.pages, id)
  const remaining = await listPages(page.notebookId)
  await Promise.all(remaining.map((p, index) => put(STORES.pages, { ...p, order: index })))
  await touchNotebook(page.notebookId)
  return true
}

export async function duplicatePage(id) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  const siblings = await listPages(page.notebookId)
  const copy = { ...page, id: newId('page'), order: siblings.length }
  await put(STORES.pages, copy)
  await touchNotebook(page.notebookId)
  return copy
}

export async function reorderPage(id, direction) {
  const page = await getById(STORES.pages, id)
  if (!page) return null
  const siblings = await listPages(page.notebookId)
  const index = siblings.findIndex((p) => p.id === id)
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= siblings.length) return null

  const a = siblings[index]
  const b = siblings[swapWith]
  await put(STORES.pages, { ...a, order: b.order })
  await put(STORES.pages, { ...b, order: a.order })
  await touchNotebook(page.notebookId)
  return true
}

async function touchNotebook(notebookId) {
  const notebook = await getById(STORES.notebooks, notebookId)
  if (!notebook) return
  notebook.updatedAt = Date.now()
  await put(STORES.notebooks, notebook)
}
