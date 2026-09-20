import { zip, unzip } from 'fflate'
import { STORES, getAll, getById, put, putMany, newId } from './db.js'

// A downloadable, restorable backup of everything in this browser's
// IndexedDB — the answer to browser storage's real weak point: clearing
// site data, switching browsers, or getting a new device all wipe it, with
// no way to get it back, regardless of whether the app is a plain tab, an
// installed PWA, or wrapped in Median. This doesn't require any server —
// it's a file the person controls, same as exporting a document from any
// other app.
//
// Format: a .zip containing
//   manifest.json   — version + counts, so a corrupt/foreign file fails
//                      fast with a clear message instead of a cryptic one
//   data.json        — every record except PDF bytes and RAG chunks
//   files/<id>.pdf   — each document's actual PDF, stored separately so
//                       the zip doesn't need everything base64-encoded
//                       inline (meaningfully smaller, and each PDF stays
//                       natively re-readable if someone opens the zip by
//                       hand)
//
// document_chunks (RAG embeddings) are deliberately excluded: they're
// regenerable from the PDF's own text via re-indexing, and are the single
// largest thing in the database (one row with a 768-number vector per
// ~700 characters of every page) — including them would make backups much
// larger for no durability benefit, since nothing is lost by leaving them
// out and just re-indexing after a restore.
const BACKUP_VERSION = 1

const DATA_STORES = [
  'folders',
  'notebooks',
  'pages',
  'documents',
  'pdfAnnotations',
  'flashcards',
  'quizzes'
]

export async function exportBackup({ onProgress } = {}) {
  const data = {}
  for (const store of DATA_STORES) {
    data[store] = await getAll(STORES[store])
    onProgress?.({ stage: 'reading', store })
  }

  const files = {}
  files['data.json'] = strToU8(JSON.stringify(data))

  let fileBytes = 0
  for (const doc of data.documents) {
    const record = await getById(STORES.files, doc.id)
    if (!record?.blob) continue
    const buffer = new Uint8Array(await record.blob.arrayBuffer())
    files[`files/${doc.id}.pdf`] = buffer
    fileBytes += buffer.length
    onProgress?.({ stage: 'reading-file', title: doc.title })
  }

  files['manifest.json'] = strToU8(
    JSON.stringify({
      version: BACKUP_VERSION,
      app: 'inkwell-study-notebook',
      exportedAt: Date.now(),
      counts: Object.fromEntries(DATA_STORES.map((s) => [s, data[s].length])),
      fileBytes
    })
  )

  onProgress?.({ stage: 'compressing' })
  const zipped = await new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
  })

  return new Blob([zipped], { type: 'application/zip' })
}

export function downloadBackup(blob) {
  const date = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inkwell-backup-${date}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export class BackupError extends Error {}

// Imports are always additive, never a merge or overwrite: every record
// gets a fresh id and every foreign key that points at another record in
// the same backup is remapped to match. This is what makes restoring safe
// to run into a library that already has data in it (e.g. importing an old
// phone's backup on a laptop that's already been used) — nothing already
// on this device can be collided with or silently replaced. The tradeoff
// is that importing the same backup twice creates two copies rather than
// detecting a duplicate; reasonable for a restore/transfer tool, called
// out in Settings so it isn't a surprise.
export async function importBackup(file, { onProgress } = {}) {
  const buffer = new Uint8Array(await file.arrayBuffer())

  const entries = await new Promise((resolve, reject) => {
    unzip(buffer, (err, out) => (err ? reject(err) : resolve(out)))
  })

  const manifestRaw = entries['manifest.json']
  const dataRaw = entries['data.json']
  if (!manifestRaw || !dataRaw) {
    throw new BackupError('This file doesn\u2019t look like an Inkwell backup.')
  }

  let manifest, data
  try {
    manifest = JSON.parse(u8ToStr(manifestRaw))
    data = JSON.parse(u8ToStr(dataRaw))
  } catch {
    throw new BackupError('This backup file is corrupted and can\u2019t be read.')
  }

  if (manifest.version > BACKUP_VERSION) {
    throw new BackupError(
      'This backup was made by a newer version of Inkwell than this one supports.'
    )
  }

  // Remap tables: old id -> new id, built up as each store is processed so
  // later stores (pages -> notebooks, documents -> nothing, flashcards ->
  // documents) can resolve the ids they reference.
  const idMap = { folders: {}, notebooks: {}, documents: {} }

  onProgress?.({ stage: 'folders' })
  const folders = (data.folders || []).map((f) => {
    const id = newId('folder')
    idMap.folders[f.id] = id
    return { ...f, id }
  })
  if (folders.length) await putMany(STORES.folders, folders)

  onProgress?.({ stage: 'notebooks' })
  const notebooks = (data.notebooks || []).map((n) => {
    const id = newId('nb')
    idMap.notebooks[n.id] = id
    return { ...n, id, folderId: n.folderId ? idMap.folders[n.folderId] ?? null : null }
  })
  if (notebooks.length) await putMany(STORES.notebooks, notebooks)

  onProgress?.({ stage: 'pages' })
  const pages = (data.pages || [])
    .filter((p) => idMap.notebooks[p.notebookId]) // drop orphans rather than crash
    .map((p) => ({ ...p, id: newId('page'), notebookId: idMap.notebooks[p.notebookId] }))
  if (pages.length) await putMany(STORES.pages, pages)

  onProgress?.({ stage: 'documents' })
  const documents = (data.documents || []).map((d) => {
    const id = newId('doc')
    idMap.documents[d.id] = id
    // A restored document hasn't been re-indexed on this device yet —
    // chunks weren't included in the backup, so the index status has to
    // reflect that rather than falsely claiming an index that isn't there.
    return { ...d, id, indexStatus: 'none', chunkCount: 0, indexedAt: null, indexError: null }
  })

  let restoredFiles = 0
  for (const original of data.documents || []) {
    const newDocId = idMap.documents[original.id]
    const bytes = entries[`files/${original.id}.pdf`]
    if (!bytes) continue // metadata survived even if the file entry is missing/corrupt
    await put(STORES.files, { id: newDocId, blob: new Blob([bytes], { type: 'application/pdf' }) })
    restoredFiles++
    onProgress?.({ stage: 'files', title: original.title })
  }
  if (documents.length) await putMany(STORES.documents, documents)

  onProgress?.({ stage: 'annotations' })
  const pdfAnnotations = (data.pdfAnnotations || [])
    .filter((a) => idMap.documents[a.documentId])
    .map((a) => ({ ...a, id: newId('ann'), documentId: idMap.documents[a.documentId] }))
  if (pdfAnnotations.length) await putMany(STORES.pdfAnnotations, pdfAnnotations)

  onProgress?.({ stage: 'flashcards' })
  const flashcards = (data.flashcards || []).map((c) => ({
    ...c,
    id: newId('card'),
    documentId: c.documentId ? idMap.documents[c.documentId] ?? null : null
  }))
  if (flashcards.length) await putMany(STORES.flashcards, flashcards)

  onProgress?.({ stage: 'quizzes' })
  const quizzes = (data.quizzes || []).map((q) => ({
    ...q,
    id: newId('quiz'),
    documentId: q.documentId ? idMap.documents[q.documentId] ?? null : null
  }))
  if (quizzes.length) await putMany(STORES.quizzes, quizzes)

  return {
    folders: folders.length,
    notebooks: notebooks.length,
    pages: pages.length,
    documents: documents.length,
    files: restoredFiles,
    flashcards: flashcards.length,
    quizzes: quizzes.length
  }
}

function strToU8(str) {
  return new TextEncoder().encode(str)
}
function u8ToStr(bytes) {
  return new TextDecoder().decode(bytes)
}
