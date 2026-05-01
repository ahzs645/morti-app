import type PocketBase from 'pocketbase'

export function usePb(): PocketBase {
  return useNuxtApp().$pb as PocketBase
}
