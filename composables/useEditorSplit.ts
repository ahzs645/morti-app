import type { Ref } from 'vue'

// Minimum pane width in px on either side of the divider — `Nt = 80` in the
// compiled `EditorSplit` (see 04_editor_controls.md §2.4).
const MIN_PANE_PX = 80

export interface UseEditorSplitOptions {
  /**
   * The container element used to compute the total available width during
   * a drag. Caller must supply a ref pointing at the split's outer wrapper.
   */
  containerRef: Ref<HTMLElement | null>
  /**
   * Reactive split ratio (preview pane fraction, 0..1). Defaults to 0.55.
   */
  splitRatio?: Ref<number>
}

/**
 * Drag-state composable for a horizontal 2-pane split. Persistence is the
 * caller's responsibility — this composable only owns the in-flight drag
 * math and listener lifecycle.
 *
 * Usage:
 * ```ts
 * const splitRatio = ref(0.55)
 * const containerRef = ref<HTMLElement | null>(null)
 * const { beginDrag, dragMove, endDrag, isDragging } = useEditorSplit({ containerRef, splitRatio })
 * ```
 */
export function useEditorSplit(options: UseEditorSplitOptions) {
  const splitRatio = options.splitRatio ?? ref(0.55)
  const isDragging = ref(false)

  let startClientX = 0
  let startLeftPx = 0
  let containerWidth = 0

  function beginDrag(event: PointerEvent) {
    const container = options.containerRef.value
    if (!container) return
    event.preventDefault()
    cancelDrag()
    const rect = container.getBoundingClientRect()
    containerWidth = rect.width
    startClientX = event.clientX
    startLeftPx = (1 - splitRatio.value) * containerWidth
    isDragging.value = true
    if (import.meta.client) {
      window.addEventListener('pointermove', dragMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    }
  }

  function dragMove(event: PointerEvent) {
    if (!isDragging.value || containerWidth <= 0) return
    const dx = event.clientX - startClientX
    let nextLeft = startLeftPx + dx
    const min = MIN_PANE_PX
    const max = Math.max(min, containerWidth - MIN_PANE_PX)
    if (nextLeft < min) nextLeft = min
    if (nextLeft > max) nextLeft = max
    splitRatio.value = 1 - nextLeft / containerWidth
  }

  function endDrag() {
    cancelDrag()
  }

  function cancelDrag() {
    if (!isDragging.value) {
      // Always make sure listeners are unbound even if an aborted drag started.
      if (import.meta.client) {
        window.removeEventListener('pointermove', dragMove)
        window.removeEventListener('pointerup', endDrag)
        window.removeEventListener('pointercancel', endDrag)
      }
      return
    }
    isDragging.value = false
    if (import.meta.client) {
      window.removeEventListener('pointermove', dragMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }

  if (getCurrentScope()) onScopeDispose(cancelDrag)

  return {
    splitRatio,
    isDragging,
    beginDrag,
    dragMove,
    endDrag,
  }
}
