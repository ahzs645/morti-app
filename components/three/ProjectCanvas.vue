<script setup lang="ts">
import { computed, ref } from 'vue'
import * as Y from 'yjs'
import DesignerCanvas from './DesignerCanvas.vue'
import type { CameraState, PublicStyle } from '~~/shared/domain/types'

interface Props {
  ydoc?: Y.Doc | null
  doc?: Y.Doc | null
  assemblyOpenDoorsDrawers?: boolean
  assemblySpaceModulesView?: boolean
  moduleVolumeHelpersVisible?: boolean
  renderMode?: 'rendered' | 'render-debug' | 'technical'
  selectedModuleIds?: string[]
  initialCameraState?: CameraState | null
  publicStyle: PublicStyle
  canvasChromeTeleportSelector?: string | null
  headlessCapture?: boolean
  captureYawRadians?: number
}

const props = withDefaults(defineProps<Props>(), {
  ydoc: null,
  doc: null,
  assemblyOpenDoorsDrawers: false,
  assemblySpaceModulesView: false,
  moduleVolumeHelpersVisible: false,
  renderMode: 'render-debug',
  selectedModuleIds: () => [],
  initialCameraState: null,
  canvasChromeTeleportSelector: null,
  headlessCapture: false,
  captureYawRadians: 0,
})

const emit = defineEmits<{
  (e: 'camera-change', state: CameraState): void
  (e: 'update:assemblyOpenDoorsDrawers', value: boolean): void
  (e: 'update:assemblySpaceModulesView', value: boolean): void
  (e: 'update:moduleVolumeHelpersVisible', value: boolean): void
  (e: 'update:renderMode', value: Props['renderMode']): void
}>()

const inner = ref<InstanceType<typeof DesignerCanvas> | null>(null)
const ydoc = computed(() => props.ydoc ?? props.doc)
const canvasRenderMode = computed<'render-debug' | 'technical'>(() =>
  props.renderMode === 'technical' ? 'technical' : 'render-debug',
)

defineExpose({
  getCaptureCanvas: (): HTMLCanvasElement | null =>
    (inner.value as any)?.getCaptureCanvas?.() ?? null,
  lockCaptureCamera: (): void => (inner.value as any)?.lockCaptureCamera?.(),
  waitForCapturePaint: (): Promise<void> => (inner.value as any)?.waitForCapturePaint?.() ?? Promise.resolve(),
})
</script>

<template>
  <DesignerCanvas
    ref="inner"
    :ydoc="ydoc"
    :assembly-open-doors-drawers="props.assemblyOpenDoorsDrawers"
    :assembly-space-modules-view="props.assemblySpaceModulesView"
    :module-volume-helpers-visible="props.moduleVolumeHelpersVisible"
    :render-mode="canvasRenderMode"
    :selected-module-ids="props.selectedModuleIds"
    :initial-camera-state="props.initialCameraState"
    :public-style="props.publicStyle"
    :canvas-chrome-teleport-selector="props.canvasChromeTeleportSelector"
    :headless-capture="props.headlessCapture"
    :capture-yaw-radians="props.captureYawRadians"
    @camera-change="(s) => emit('camera-change', s)"
    @update:assembly-open-doors-drawers="(v) => emit('update:assemblyOpenDoorsDrawers', v)"
    @update:assembly-space-modules-view="(v) => emit('update:assemblySpaceModulesView', v)"
    @update:module-volume-helpers-visible="(v) => emit('update:moduleVolumeHelpersVisible', v)"
    @update:render-mode="(v) => emit('update:renderMode', v === 'technical' ? 'technical' : 'render-debug')"
  >
    <template #canvas-chrome-append>
      <slot name="canvas-chrome-append" />
    </template>
  </DesignerCanvas>
</template>
