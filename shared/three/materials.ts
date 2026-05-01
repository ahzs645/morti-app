import * as THREE from 'three'

/**
 * Material registry — mirrors the verbatim Madera `Dt_x5Iy5.js` materials at
 * lines 5476–5568 (panel mesh classes `di` / `fr` / `$r`).
 *
 * Three modes:
 *   - `shaded`    → MeshStandardMaterial (lit / render-debug)
 *   - `unlit`     → MeshBasicMaterial
 *   - `outline`   → MeshBasicMaterial with polygon-offset (basic mode)
 */

export type PanelMaterialMode = 'shaded' | 'unlit' | 'outline'

export function makePanelMaterial(mode: PanelMaterialMode, color: number): THREE.Material {
  if (mode === 'shaded') {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.08,
      roughness: 0.62,
    })
  }
  if (mode === 'unlit') {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
  }
  // outline (basic)
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    toneMapped: false,
  })
}

/** Rail-cut overlay material — flat, with negative polygon offset so it floats
 *  ABOVE the panel face. Mirrors `hl` (Dt_x5Iy5.js L580–656) fill mode. */
export function makeRailCutMaterial(color: number, opacity = 0.6): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  })
}

export function makeRailCutOutlineMaterial(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: true,
    depthWrite: true,
  })
}

// ---------------------------------------------------------------------------
// Per-spec factory helpers (15_outline_shader spec, materials section).
//
// These four factories pin the verbatim numbers from `Dt_x5Iy5.js` (panel
// classes L505–656) and the technical render-mode tokens from `BNlvPyv_.js`
// (`bn.technical.colors.outlines = "#f59e0b"`).
// ---------------------------------------------------------------------------

/**
 * Lit panel surface (`di extends Group`, L5476–5500). Slightly metallic so
 * the wood-look fills pick up a subtle highlight under the directional key.
 */
export function makeShadedPanelMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.08,
    roughness: 0.62,
  })
}

/**
 * Unlit panel material — used in the default 'rendered' UI mode where the
 * lighting rig is intentionally low and the panels read as flat plates.
 */
export function makeUnlitPanelMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}

/**
 * Outline material that matches the technical render mode's amber outline
 * colour (`#f59e0b`, from BNlvPyv_.js `bn.technical.colors.outlines`).
 *
 * NOTE: the actual scene outline pass is post-processing-driven via the TSL
 * pipeline in `outline.ts`. This factory is for stand-alone outline meshes
 * (e.g. ViewHelper axes, hover highlights) that need to colour-match.
 */
export function makeOutlineMaterial(color: number = 0xf59e0b): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}

/**
 * Background fill for hardware preview cards (the small still images on the
 * dashboard). Unlit + tone-mapping-agnostic so the swatch reads as the exact
 * pixel value the design system specifies.
 */
export function makeBackgroundMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}
