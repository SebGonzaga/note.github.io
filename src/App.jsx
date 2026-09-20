import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import Home from './pages/Home.jsx'
import NotebookPage from './pages/Notebook.jsx'
import { useTheme } from './hooks/useTheme.js'
import * as store from './services/storage/notebooks.js'
import * as docStore from './services/storage/documents.js'

// The PDF routes are code-split: pdf.js is by far the heaviest dependency
// in the app, and someone who only ever takes handwritten notes shouldn't
// pay to download it. Splitting here keeps the initial bundle small and
// loads the viewer on first navigation to a document.
const Documents = lazy(() => import('./pages/Documents.jsx'))
const DocumentPage = lazy(() => import('./pages/Document.jsx'))
const Flashcards = lazy(() => import('./pages/Flashcards.jsx'))
const Quizzes = lazy(() => import('./pages/Quizzes.jsx'))
// Settings pulls in fflate for backup/restore — small on its own, but
// there's no reason to make every visitor download it just to open the
// library. Same reasoning as the PDF routes above.
const Settings = lazy(() => import('./pages/Settings.jsx'))

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [folders, setFolders] = useState([])
  const [notebooks, setNotebooks] = useState([])
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const [f, n] = await Promise.all([store.listFolders(), store.listNotebooks()])
    setFolders(f)
    setNotebooks(n)
  }, [])

  const refreshDocuments = useCallback(async () => {
    setDocuments(await docStore.listDocuments())
  }, [])

  useEffect(() => {
    Promise.all([refresh(), refreshDocuments()]).then(() => setLoaded(true))
  }, [refresh, refreshDocuments])

  if (!loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-paper text-muted">
        Loading your notebooks…
      </div>
    )
  }

  const context = {
    folders,
    notebooks,
    documents,
    refresh,
    refreshDocuments,
    search,
    theme,
    toggleTheme
  }

  return (
    <Routes>
      <Route
        element={
          <Layout
            folders={folders}
            notebooks={notebooks}
            documents={documents}
            theme={theme}
            toggleTheme={toggleTheme}
            search={search}
            setSearch={setSearch}
            context={context}
          />
        }
      >
        <Route path="/" element={<Home filter="all" />} />
        <Route path="/recent" element={<Home filter="recent" />} />
        <Route path="/favorites" element={<Home filter="favorites" />} />
        <Route path="/notebook/:id" element={<NotebookPage />} />
        <Route
          path="/documents"
          element={
            <Suspense fallback={<RouteFallback label="Loading documents…" />}>
              <Documents />
            </Suspense>
          }
        />
        <Route
          path="/document/:id"
          element={
            <Suspense fallback={<RouteFallback label="Loading PDF viewer…" />}>
              <DocumentPage />
            </Suspense>
          }
        />
        <Route
          path="/flashcards"
          element={
            <Suspense fallback={<RouteFallback label="Loading flashcards…" />}>
              <Flashcards />
            </Suspense>
          }
        />
        <Route
          path="/quizzes"
          element={
            <Suspense fallback={<RouteFallback label="Loading quizzes…" />}>
              <Quizzes />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<RouteFallback label="Loading settings…" />}>
              <Settings />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}

function RouteFallback({ label }) {
  return <p className="px-6 py-16 text-center text-sm text-muted">{label}</p>
}
