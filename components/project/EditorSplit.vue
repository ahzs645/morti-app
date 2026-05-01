<script setup lang="ts">
interface Props {
  splitRatio?: number
  dividerLocked?: boolean
  collapseInputs?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  splitRatio: 0.55,
  dividerLocked: false,
  collapseInputs: false,
})

const emit = defineEmits<{
  (e: 'update:splitRatio', value: number): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const internalRatio = ref(props.splitRatio)
const MIN_PANE_PX = 80

let startClientX = 0
let startLeftPx = 0

watch(
  () => props.splitRatio,
  (v) => { internalRatio.value = v },
)

// Watch dividerLocked: locking mid-drag aborts.
watch(
  () => props.dividerLocked,
  (locked) => {
    if (locked) endDrag()
  },
)

function beginDrag(event: PointerEvent) {
  if (props.dividerLocked) return
  endDrag()
  event.preventDefault()
  isDragging.value = true
  startClientX = event.clientX
  const width = containerRef.value?.getBoundingClientRect().width ?? 0
  startLeftPx = (1 - internalRatio.value) * width
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value || !containerRef.value) return
  const width = containerRef.value.getBoundingClientRect().width
  const dx = event.clientX - startClientX
  const leftPx = startLeftPx + dx
  const clampedLeftPx = Math.min(Math.max(leftPx, MIN_PANE_PX), width - MIN_PANE_PX)
  internalRatio.value = 1 - clampedLeftPx / width
  emit('update:splitRatio', internalRatio.value)
}

function endDrag() {
  isDragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

onBeforeUnmount(endDrag)

const inputsStyle = computed(() => {
  if (props.collapseInputs) {
    return { flex: '0 0 0', minWidth: 0, overflow: 'hidden' }
  }
  return { flex: '1 1 0' }
})

const previewStyle = computed(() => {
  if (props.collapseInputs) {
    return { flex: '1 1 100%', minWidth: 0, maxWidth: '100%' }
  }
  return { flex: `0 0 ${internalRatio.value * 100}%` }
})
</script>

<template>
  <div
    ref="containerRef"
    class="editor-split"
    :class="{ 'is-dragging': isDragging, 'editor-split--inputs-collapsed': props.collapseInputs }"
  >
    <div
      class="pane pane-inputs"
      :style="inputsStyle"
      :aria-hidden="props.collapseInputs ? 'true' : undefined"
    >
      <slot>
        <div class="pane-placeholder">
          <span class="pane-label">Inputs</span>
        </div>
      </slot>
    </div>

    <div
      v-show="!props.collapseInputs"
      class="divider"
      :class="{ 'divider-locked': props.dividerLocked }"
      @pointerdown.prevent="beginDrag"
    >
      <div
        v-if="!props.dividerLocked"
        class="divider-handle"
      />
    </div>

    <div
      class="pane pane-preview"
      :style="previewStyle"
    >
      <slot name="preview">
        <div class="pane-placeholder">
          <span class="pane-label">Preview</span>
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.editor-split {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  background-color: var(--ui-bg);
}
@media (min-width: 768px) {
  .editor-split {
    flex-direction: row;
  }
}
.editor-split.is-dragging {
  cursor: col-resize;
}
.pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.pane-preview {
  flex-shrink: 0;
}
.pane-inputs {
  overflow-y: auto;
}
.pane-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ui-text-muted);
}
.pane-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  opacity: 0.5;
  text-transform: uppercase;
}
.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 9px;
  cursor: row-resize;
  z-index: 10;
  background-color: var(--ui-bg);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  border-left: 0;
  border-right: 0;
  transition: background-color 0.15s;
}
@media (min-width: 768px) {
  .divider {
    cursor: col-resize;
    border-top: 0;
    border-bottom: 0;
    border-left: 1px solid var(--ui-border);
    border-right: 1px solid var(--ui-border);
  }
}
.divider.divider-locked {
  cursor: default;
  pointer-events: none;
}
.divider:hover:not(.divider-locked),
.is-dragging .divider:not(.divider-locked) {
  background-color: var(--ui-bg-elevated);
}
.divider-handle {
  width: 32px;
  height: 3px;
  border-radius: 9999px;
  background-color: var(--ui-border-accented);
  pointer-events: none;
  transition: background-color 0.15s;
}
@media (min-width: 768px) {
  .divider-handle {
    width: 3px;
    height: 32px;
  }
}
.divider:hover:not(.divider-locked) .divider-handle,
.is-dragging .divider:not(.divider-locked) .divider-handle {
  background-color: var(--ui-primary);
}
</style>
