import { withBase } from 'ufo'

// Resolves a `public/` asset path against app.baseURL so assets keep working
// when the app is deployed under a sub-path (e.g. GitHub Pages).
export function usePublicAsset() {
  const baseURL = useRuntimeConfig().app.baseURL || '/'
  return (path: string) => withBase(path, baseURL)
}
