import type PocketBase from 'pocketbase'
import type posthog from 'posthog-js'
import type { ThreeRendererPlugin } from '~~/plugins/three-renderer.client'

declare module '#app' {
  interface NuxtApp {
    $pb: PocketBase
    $posthog: typeof posthog
    $threeRenderer: ThreeRendererPlugin
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $pb: PocketBase
    $posthog: typeof posthog
    $threeRenderer: ThreeRendererPlugin
  }
}

export {}
