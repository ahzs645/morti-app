/**
 * `useThreejsCanvas` — mount a `<canvas>` with its own dedicated WebGLRenderer.
 *
 * Each consumer owns its own renderer. The shared $threeRenderer plugin is
 * kept around only as a place to share global config (max fps, max texture
 * dimension) and the warn patch — it's no longer the actual draw target.
 *
 * Lifecycle:
 *   onMounted    → create WebGLRenderer bound to canvasRef, install ResizeObserver,
 *                  start rAF loop.
 *   per frame    → push latest size to renderer + apply camera projection,
 *                  call render(renderer, dt).
 *   onBeforeUnmount → cancel rAF, dispose renderer, disconnect observer.
 */

import {
  type ComputedRef,
  type MaybeRef,
  type Ref,
  isRef,
  onBeforeUnmount,
  onMounted,
  unref,
} from 'vue'

import {
  ACESFilmicToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
  type Camera,
  type Scene,
} from 'three'

const MAX_GPU_DIMENSION = 16384
const MAX_PIXEL_RATIO = 2

export interface UseThreejsCanvasOptions {
  canvasRef: Ref<HTMLCanvasElement | null>
  scene: MaybeRef<Scene> | ComputedRef<Scene>
  camera: MaybeRef<Camera> | ComputedRef<Camera>
  render: (renderer: WebGLRenderer, dt: number) => void
  onResize?: (width: number, height: number) => void
  clearColor?: number
  clearAlpha?: number
  /** When true, do not auto-render every frame (caller drives via render()). */
  manual?: boolean
}

export interface UseThreejsCanvasHandle {
  resize: () => void
  requestRender: () => void
  dispose: () => void
}

export function useThreejsCanvas(opts: UseThreejsCanvasOptions): UseThreejsCanvasHandle {
  const cfg = useRuntimeConfig().public.three as { maxFps: number, maxTextureDimension: number, clearColor: number }
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_PIXEL_RATIO)
  const maxDim = Math.min(MAX_GPU_DIMENSION, cfg?.maxTextureDimension ?? MAX_GPU_DIMENSION)
  const clampDim = (dim: number) => Math.max(1, Math.min(dim, Math.floor(maxDim / dpr)))

  let renderer: WebGLRenderer | null = null
  let observer: ResizeObserver | null = null
  let rafId: number | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let lastWidth = 0
  let lastHeight = 0
  let lastFrameTs = 0

  const resolveScene = (): Scene | null => {
    try { return unref(opts.scene as MaybeRef<Scene>) ?? null } catch { return null }
  }
  const resolveCamera = (): Camera | null => {
    try { return unref(opts.camera as MaybeRef<Camera>) ?? null } catch { return null }
  }

  function applyCameraSize(camera: Camera, width: number, height: number) {
    const aspect = height > 0 ? width / height : 1
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as PerspectiveCamera
      if (cam.aspect !== aspect) {
        cam.aspect = aspect
        cam.updateProjectionMatrix()
      }
    } else if ((camera as OrthographicCamera).isOrthographicCamera) {
      const cam = camera as OrthographicCamera
      const verticalExtent = cam.top - cam.bottom
      const halfH = verticalExtent / 2
      const halfW = halfH * aspect
      const centerX = (cam.right + cam.left) / 2
      cam.left = centerX - halfW
      cam.right = centerX + halfW
      cam.updateProjectionMatrix()
    }
  }

  function syncSize(force = false) {
    const canvas = opts.canvasRef.value
    if (!canvas || !renderer) return
    const rect = canvas.getBoundingClientRect()
    const cssW = Math.max(1, Math.floor(rect.width))
    const cssH = Math.max(1, Math.floor(rect.height))
    const w = clampDim(Math.floor(cssW * dpr))
    const h = clampDim(Math.floor(cssH * dpr))
    if (!force && w === lastWidth && h === lastHeight) return
    lastWidth = w
    lastHeight = h
    // setSize with `false` so we don't overwrite the canvas's CSS size.
    renderer.setSize(cssW, cssH, false)
    canvas.width = w
    canvas.height = h
    const camera = resolveCamera()
    if (camera) applyCameraSize(camera, w, h)
    opts.onResize?.(w, h)
  }

  function renderOnce() {
    if (!renderer) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const dt = lastFrameTs === 0 ? 0 : (now - lastFrameTs) / 1000
    lastFrameTs = now

    const scene = resolveScene()
    const camera = resolveCamera()
    if (scene && camera) {
      try {
        opts.render(renderer, dt)
      } catch (err) {
        // Don't break the loop on consumer error.
        console.error('[useThreejsCanvas] render error', err)
      }
    }
  }

  function frame() {
    if (!renderer) return
    const minFrameMs = 1000 / Math.max(1, cfg?.maxFps ?? 60)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = lastFrameTs === 0 ? minFrameMs : now - lastFrameTs
    if (elapsed >= minFrameMs) renderOnce()
    rafId = window.requestAnimationFrame(frame)
  }

  function requestRender() {
    syncSize()
    renderOnce()
  }

  function scheduleResize() {
    if (resizeTimer !== null) return
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      syncSize()
      if (opts.manual) renderOnce()
    }, 100)
  }

  onMounted(() => {
    const canvas = opts.canvasRef.value
    if (!canvas) return
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    }
    catch (err) {
      console.error('[useThreejsCanvas] renderer init error', err)
      return
    }
    renderer.setPixelRatio(dpr)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    if (typeof opts.clearColor === 'number') {
      renderer.setClearColor(opts.clearColor, opts.clearAlpha ?? 1)
    }
    syncSize(true)

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => scheduleResize())
      observer.observe(canvas)
    } else {
      window.addEventListener('resize', scheduleResize)
    }

    if (opts.manual) {
      renderOnce()
    }
    else {
      rafId = window.requestAnimationFrame(frame)
    }
  })

  function dispose() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }
    if (observer) {
      observer.disconnect()
      observer = null
    } else {
      window.removeEventListener('resize', scheduleResize)
    }
    if (renderer) {
      renderer.dispose()
      renderer.forceContextLoss?.()
      renderer = null
    }
  }

  onBeforeUnmount(() => dispose())

  if (isRef(opts.scene) || isRef(opts.camera)) {
    // First onMounted call will trigger syncSize(true).
  }

  return {
    resize: () => {
      syncSize(true)
      if (opts.manual) renderOnce()
    },
    requestRender,
    dispose,
  }
}
