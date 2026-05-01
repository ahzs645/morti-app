import type posthog from 'posthog-js'
import type { ThreeRendererPlugin } from '~~/plugins/three-renderer.client'

declare module '#app' {
  interface NuxtApp {
    $posthog: typeof posthog
    $threeRenderer: ThreeRendererPlugin
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $posthog: typeof posthog
    $threeRenderer: ThreeRendererPlugin
  }
}

export {}
