import type { WebGLRenderer } from 'three'

export type ThreeRenderFn = (renderer: WebGLRenderer) => void

export interface ThreeRendererPlugin {
  renderer: WebGLRenderer | null
  getRenderer: () => Promise<WebGLRenderer>
  register: (canvas: HTMLCanvasElement, render: ThreeRenderFn) => Promise<() => void>
  dispose: () => void
}

let warnPatched = false
function patchThreeMultipleInstancesWarn() {
  if (warnPatched) return
  warnPatched = true
  const originalWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.includes('Multiple instances of Three.js')) {
      return
    }
    originalWarn(...args)
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  patchThreeMultipleInstancesWarn()

  const three = useRuntimeConfig().public.three as {
    maxTextureDimension: number
    clearColor: number
    maxFps: number
  }

  let renderer: WebGLRenderer | null = null
  const targets = new Map<HTMLCanvasElement, ThreeRenderFn>()
  let rafId: number | null = null
  let lastFrameTs = 0

  async function getRenderer(): Promise<WebGLRenderer> {
    if (renderer) return renderer
    const { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping } = await import('three')
    if (renderer) return renderer
    const r = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    r.outputColorSpace = SRGBColorSpace
    r.toneMapping = ACESFilmicToneMapping
    r.toneMappingExposure = 1
    ;(r as any).capabilities && ((r as any).capabilities.maxTextureSize = Math.min(
      (r as any).capabilities.maxTextureSize ?? three.maxTextureDimension,
      three.maxTextureDimension,
    ))
    renderer = r
    return r
  }

  function loop(ts: number) {
    rafId = window.requestAnimationFrame(loop)
    const minFrameMs = 1000 / Math.max(1, three.maxFps)
    if (ts - lastFrameTs < minFrameMs) return
    lastFrameTs = ts
    if (!renderer || targets.size === 0) return
    for (const fn of targets.values()) {
      try {
        fn(renderer)
      } catch {
        // Render callbacks must never break the shared loop.
      }
    }
  }

  function ensureLoop() {
    if (rafId !== null) return
    lastFrameTs = 0
    rafId = window.requestAnimationFrame(loop)
  }

  function stopLoopIfIdle() {
    if (targets.size === 0 && rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  async function register(canvas: HTMLCanvasElement, render: ThreeRenderFn): Promise<() => void> {
    await getRenderer()
    targets.set(canvas, render)
    ensureLoop()
    return () => {
      targets.delete(canvas)
      stopLoopIfIdle()
    }
  }

  function dispose() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    targets.clear()
    if (renderer) {
      renderer.dispose()
      renderer = null
    }
  }

  const api: ThreeRendererPlugin = {
    get renderer() {
      return renderer
    },
    getRenderer,
    register,
    dispose,
  }

  nuxtApp.provide('threeRenderer', api)
})
