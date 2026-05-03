import * as THREE from 'three'
import { getGrainTexture } from './grain-textures'
import type { MaterialGrain } from '~~/shared/domain/materials'

/**
 * Material registry — mirrors the verbatim Morti `Dt_x5Iy5.js` materials at
 * lines 5476–5568 (panel mesh classes `di` / `fr` / `$r`).
 *
 * Three modes:
 *   - `shaded`    → MeshStandardMaterial (lit / render-debug)
 *   - `unlit`     → MeshBasicMaterial
 *   - `outline`   → MeshBasicMaterial with polygon-offset (basic mode)
 */

export type PanelMaterialMode = 'shaded' | 'unlit' | 'outline'

export interface PanelMaterialSpec {
  color: number
  /** 0-1; defaults to 0.62 (verbatim Morti baseline). */
  roughness?: number
  /** 0-1; defaults to 0.08 (verbatim Morti baseline). */
  metalness?: number
  /** Wood-grain pattern for triplanar texture sampling. Lacquers/custom
   *  pass `'lacquer-white' | 'lacquer-charcoal' | 'custom'` (or omit) to
   *  render flat, no grain. */
  grain?: MaterialGrain
  /** World-space grain density in tiles-per-meter. Higher = tighter pattern.
   *  Defaults to 5 (one stripe roughly every 20cm of panel face). */
  grainScale?: number
}

export function makePanelMaterial(
  mode: PanelMaterialMode,
  colorOrSpec: number | PanelMaterialSpec,
): THREE.Material {
  const spec: PanelMaterialSpec = typeof colorOrSpec === 'number'
    ? { color: colorOrSpec }
    : colorOrSpec
  const color = new THREE.Color(spec.color)

  if (mode === 'shaded') {
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: spec.metalness ?? 0.08,
      roughness: spec.roughness ?? 0.62,
    })
    const grainTex = spec.grain ? getGrainTexture(spec.grain) : null
    if (grainTex) {
      attachTriplanarGrain(material, grainTex, spec.grainScale ?? 5)
    }
    return material
  }
  if (mode === 'unlit') {
    return new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
  }
  // outline (basic)
  return new THREE.MeshBasicMaterial({
    color,
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

/**
 * Inject world-space triplanar sampling of a grayscale grain DataTexture into
 * a MeshStandardMaterial. The texture multiplies `diffuseColor.rgb` so the
 * base color is preserved while stripes darken/lighten it. Roughness is also
 * modulated slightly so polished bands shine differently than open grain.
 *
 * Triplanar (rather than UV) because:
 *   - BoxGeometry UVs are per-face 0..1, ignoring world units; tiling
 *     produces inconsistent grain density across panel sizes.
 *   - CSG boolean cuts (door pulls) can scramble UVs entirely.
 */
function attachTriplanarGrain(
  material: THREE.MeshStandardMaterial,
  grainTex: THREE.DataTexture,
  tilesPerMeter: number,
): void {
  // Expose the texture so Three's built-in resource tracking disposes it
  // alongside the material on cleanup. Setting `map` also lets MeshStandard's
  // existing diffuse-map shader chunks compile in (we override their UV in
  // the shader injection below).
  material.map = grainTex
  material.userData.grainScale = tilesPerMeter

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrainScale = { value: tilesPerMeter }

    // -- VERTEX: pass world position + world normal to the fragment shader.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos_grain;
varying vec3 vWorldNormal_grain;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
vWorldPos_grain = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal_grain = normalize(mat3(modelMatrix) * objectNormal);`,
      )

    // -- FRAGMENT: triplanar-sample `map` using world-space coords + the
    // dominant face axis, then modulate diffuseColor and roughness.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos_grain;
varying vec3 vWorldNormal_grain;
uniform float uGrainScale;`,
      )
      .replace(
        '#include <map_fragment>',
        `// Triplanar sample of grain texture (overrides the standard <map_fragment>).
vec3 blend = abs(vWorldNormal_grain);
blend = pow(blend, vec3(4.0));
blend /= max(blend.x + blend.y + blend.z, 1e-5);
vec2 uvX = vWorldPos_grain.zy * uGrainScale;
vec2 uvY = vWorldPos_grain.xz * uGrainScale;
vec2 uvZ = vWorldPos_grain.xy * uGrainScale;
vec3 cX = texture2D(map, uvX).rgb;
vec3 cY = texture2D(map, uvY).rgb;
vec3 cZ = texture2D(map, uvZ).rgb;
vec3 grainSample = cX * blend.x + cY * blend.y + cZ * blend.z;
// Texture is encoded so 1.0 ≈ neutral, range [0.5, 1.15]; expand back.
float grainValue = grainSample.r;
diffuseColor.rgb *= grainValue;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
// Polished bands (high grainValue) look slightly smoother; open pores rougher.
roughnessFactor *= mix(1.08, 0.92, clamp(grainValue, 0.0, 1.0));`,
      )
  }

  // Force a recompile so the injection takes effect immediately.
  material.needsUpdate = true
}
