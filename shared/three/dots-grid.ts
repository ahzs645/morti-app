/**
 * `DotsGrid` — flat plane of small circles arranged on a regular grid, with
 * a smooth radial alpha fall-off from origin.
 *
 * Spec source: _spec/03_three_scene.md (DotsGrid section L302–372)
 *   Original obfuscated source: _chunks/beautified/Dt_x5Iy5.js
 *
 * Pipeline:
 *   1. For each cell in [-cellsPerSide..cellsPerSide]² compute (px, pz).
 *   2. Alpha = 1 - smoothstep(falloffStart, falloffEnd, hypot(px, pz)).
 *      Cells with alpha <= 0 are skipped.
 *   3. Build a CircleGeometry per surviving cell (segments = clamp(8..24, ceil(48 * dotRadius)))
 *      and bake the alpha into a per-vertex RGBA `color` attribute (rgb=1, a=alpha).
 *   4. Merge into one BufferGeometry via BufferGeometryUtils.mergeGeometries
 *      and dispose all the per-cell temporaries.
 *   5. Mark the merged geometry as `outlineExclude=1` so the post-processing
 *      pass does not draw an outline around individual dots.
 */

import {
  type ColorRepresentation,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three'

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { addOutlineExcludeAttribute } from './outline'

export interface DotsGridOptions {
  color: ColorRepresentation
  dotRadius?: number
  falloffStart?: number
  falloffEnd?: number
  gap?: number
  /**
   * Spec note: original source enumerates cells in `[-cellsPerSide..cellsPerSide]`
   * where `cellsPerSide = floor(falloffEnd / gap)`. The `count` arg here is a
   * convenience cap retained for callers who want to bound work explicitly;
   * if omitted, it falls back to that derived value. Default 80 to mirror
   * the value used in design 3D scene config.
   */
  count?: number
}

/** `ol(s)` — segments per dot; clamp to [8, 24] of `ceil(48 * dotRadius)`. */
function dotSegments(dotRadius: number): number {
  return Math.max(8, Math.min(24, Math.ceil(dotRadius * 48)))
}

/** GLSL-style smoothstep — `sl(s, e, i)` in source. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

interface BuildResult {
  geometry: BufferGeometry
  disposeTemps: () => void
}

function buildGeometry(
  dotRadius: number,
  falloffStart: number,
  falloffEnd: number,
  gap: number,
  countCap: number,
): BuildResult {
  const cellsFromFalloff = Math.floor(falloffEnd / gap)
  const cellsPerSide = Math.min(countCap, cellsFromFalloff)
  const segments = dotSegments(dotRadius)
  const tempGeoms: CircleGeometry[] = []

  for (let l = -cellsPerSide; l <= cellsPerSide; l++) {
    for (let d = -cellsPerSide; d <= cellsPerSide; d++) {
      const px = d * gap
      const pz = l * gap
      const distance = Math.hypot(px, pz)
      const alpha = 1 - smoothstep(falloffStart, falloffEnd, distance)
      if (alpha <= 0) continue

      const cell = new CircleGeometry(dotRadius, segments)
      cell.translate(px, pz, 0)

      // Bake per-vertex RGBA: rgb=1, a=alpha. Vertex shader will modulate
      // the material's base colour by these alphas via vertexColors=true.
      const vertCount = cell.getAttribute('position').count
      const rgba = new Float32Array(vertCount * 4)
      for (let i = 0; i < vertCount; i++) {
        rgba[i * 4 + 0] = 1
        rgba[i * 4 + 1] = 1
        rgba[i * 4 + 2] = 1
        rgba[i * 4 + 3] = alpha
      }
      cell.setAttribute('color', new BufferAttribute(rgba, 4))
      tempGeoms.push(cell)
    }
  }

  const merged = mergeGeometries(tempGeoms, false)
  if (!merged) {
    for (const g of tempGeoms) g.dispose()
    throw new Error('DotsGrid: mergeGeometries returned null')
  }

  return {
    geometry: merged,
    disposeTemps: () => {
      for (const g of tempGeoms) g.dispose()
    },
  }
}

/**
 * `cl extends Group` — DotsGrid mesh container.
 *
 * Defaults match the values the DesignerCanvas uses (Dt_x5Iy5.js L6751):
 *   { dotRadius: 0.01, falloffStart: 1, falloffEnd: 2, gap: 0.18, count: 80 }
 */
export class DotsGrid extends Group {
  readonly mesh: Mesh
  readonly material: MeshBasicMaterial

  constructor(options: DotsGridOptions) {
    super()

    const dotRadius = options.dotRadius ?? 0.01
    const falloffStart = options.falloffStart ?? 1
    const falloffEnd = options.falloffEnd ?? 2
    const gap = options.gap ?? 0.18
    const count = options.count ?? 80

    if (gap <= 0) throw new Error('DotsGrid: gap must be > 0')
    if (dotRadius <= 0) throw new Error('DotsGrid: dotRadius must be > 0')
    if (falloffStart < 0) throw new Error('DotsGrid: falloffStart must be >= 0')
    if (falloffEnd <= falloffStart) throw new Error('DotsGrid: falloffEnd must be > falloffStart')

    const { geometry, disposeTemps } = buildGeometry(
      dotRadius,
      falloffStart,
      falloffEnd,
      gap,
      count,
    )
    disposeTemps()

    // Excluded from outline post-processing so the dots themselves don't get
    // edged when running the technical render path.
    addOutlineExcludeAttribute(geometry, 1)

    this.material = new MeshBasicMaterial({
      color: new Color(options.color),
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      opacity: 1,
    })
    this.mesh = new Mesh(geometry, this.material)
    this.add(this.mesh)
  }

  get color(): Color {
    return this.material.color.clone()
  }

  set color(value: ColorRepresentation) {
    this.material.color.set(value)
  }

  get opacity(): number {
    return this.material.opacity
  }

  set opacity(value: number) {
    this.material.opacity = Math.max(0, Math.min(1, value))
  }

  dispose(): void {
    const geom = this.mesh.geometry
    if (geom) geom.dispose()
    this.material.dispose()
  }
}
