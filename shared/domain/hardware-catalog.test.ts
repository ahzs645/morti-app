import { describe, expect, it } from 'vitest'
import { HARDWARE_CATALOG } from './hardware-catalog'

describe('hardware catalog', () => {
  it('gives every entry a unique code', () => {
    const codes = HARDWARE_CATALOG.map(h => h.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('marks exactly the assets that are bundled', () => {
    // Only 120-038-199.glb ships today. Anything else claiming to be bundled
    // would request a file that is not there and fail silently in the loader.
    for (const item of HARDWARE_CATALOG) {
      if (item.modelBundled) {
        expect(item.modelGlbSrc, item.code).toContain('120-038-199.glb')
      }
    }
  })

  it('still records the intended path for unbundled models', () => {
    // The path is the drop-in target when the asset is sourced, so it must not
    // be blanked out just because the file is missing.
    for (const item of HARDWARE_CATALOG) {
      expect(item.modelGlbSrc.length, item.code).toBeGreaterThan(0)
    }
  })

  it('has at least one bundled model, so the preview path stays exercised', () => {
    expect(HARDWARE_CATALOG.some(h => h.modelBundled)).toBe(true)
  })
})
