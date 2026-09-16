import { useCallback, useMemo, useRef, useState } from 'react'

// Simple linear undo/redo stack. `reset(value)` re-seeds the stack (used
// when switching pages, so undo history doesn't leak across pages).
export function useHistory(initial) {
  const [stack, setStack] = useState([initial])
  const [index, setIndex] = useState(0)
  const skipPushRef = useRef(false)

  const value = stack[index]

  const commit = useCallback(
    (next) => {
      setStack((prev) => {
        const trimmed = prev.slice(0, index + 1)
        return [...trimmed, next]
      })
      setIndex((i) => i + 1)
    },
    [index]
  )

  const undo = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const redo = useCallback((max) => setIndex((i) => Math.min(max, i + 1)), [])

  const reset = useCallback((next) => {
    setStack([next])
    setIndex(0)
  }, [])

  const canUndo = index > 0
  const canRedo = index < stack.length - 1

  return useMemo(
    () => ({
      value,
      commit,
      undo,
      redo: () => redo(stack.length - 1),
      reset,
      canUndo,
      canRedo
    }),
    [value, commit, undo, redo, stack.length, reset, canUndo, canRedo]
  )
}
