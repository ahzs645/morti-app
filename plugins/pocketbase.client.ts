import PocketBase from 'pocketbase'

// Local-only mode: PocketBase is still provided as $pb so cloud-aware code paths
// can call into it, but we never trigger an authRefresh and we never fail-fast
// if the backend isn't reachable. The runtimeConfig.public.pocketbaseUrl can
// point at a real PocketBase if you want demo-loading; otherwise leave the
// default and demos will simply 404.
export default defineNuxtPlugin((nuxtApp) => {
  const baseUrl = useRuntimeConfig().public.pocketbaseUrl as string
  const pb = new PocketBase(baseUrl)
  nuxtApp.provide('pb', pb)
})
