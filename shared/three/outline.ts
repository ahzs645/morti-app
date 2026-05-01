/**
 * Morti outline post-processing pipeline.
 *
 * Spec source: _spec/15_outline_shader.md
 *   Original obfuscated source: _chunks/beautified/MUhM_d7C.js (487 lines).
 *
 * This is NOT a classic ShaderMaterial. The whole pipeline is built with the
 * Three.js TSL (Three Shading Language) Node system and assigned to a
 * PostProcessing instance's `outputNode`.
 *
 * Pipeline overview:
 *   1. Bake per-triangle surfaceId into the per-vertex `color` attribute via
 *      union-find clustering (coplanar tris merged + edge-adjacent tris with
 *      normals within 50° merged).
 *   2. Render the scene through a PassNode with an MRT that captures
 *      `output`, `surfaceId`, `outlineExclude` (and implicit `depth`).
 *      `surfaceId` and `outlineExclude` textures are forced to NearestFilter.
 *   3. Run a full-screen TSL composite that detects 8-neighbour surfaceId
 *      discontinuities, weighted by `(1 - centerExcl) * (1 - tapExcl)`,
 *      thresholded with `step(idThreshold, sum)`, then mixes the ink colour
 *      over the scene fill. Wrapped in `renderOutput(...)` so the renderer
 *      applies tone-mapping + output colour-space encoding after compositing.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  NearestFilter,
  type Object3D,
  type Scene,
  Vector2,
  Vector3,
} from 'three'

import {
  Fn,
  attribute,
  float,
  length,
  mix,
  mrt,
  output,
  pass,
  renderOutput,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

// ---------------------------------------------------------------------------
// Uniforms — `De()` in source (lines 264–266)
// ---------------------------------------------------------------------------

export interface OutlineUniforms {
  invTexelSize: ReturnType<typeof uniform>
  inkRgb: ReturnType<typeof uniform>
  inkStrength: ReturnType<typeof uniform>
  idThreshold: ReturnType<typeof uniform>
}

/**
 * `De()` — create the four outline uniforms with their documented defaults:
 *   invTexelSize = (1, 1)    — replaced by setOutlineTexelSize(...) on resize
 *   inkRgb       = (0, 0, 0) — replaced by setOutlineColor(...) at runtime
 *   inkStrength  = 1
 *   idThreshold  = 0.001
 */
export function createOutlineUniforms(): OutlineUniforms {
  return {
    invTexelSize: uniform(new Vector2(1, 1)),
    inkRgb: uniform(new Vector3(0, 0, 0)),
    inkStrength: uniform(1),
    idThreshold: uniform(0.001),
  }
}

// ---------------------------------------------------------------------------
// Texel-size + colour setters — `Be()`, `Ve()`
// ---------------------------------------------------------------------------

/**
 * `Be(uniforms, w, h)` — write `(1/max(1,w), 1/max(1,h))` into invTexelSize.
 * Called by the resize watcher inside `useThreejsCanvas` on every size change.
 */
export function setOutlineTexelSize(
  uniforms: OutlineUniforms,
  width: number,
  height: number,
): void {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  ;(uniforms.invTexelSize.value as Vector2).set(1 / w, 1 / h)
}

const _scratchInkColor = /* @__PURE__ */ new Color()

/**
 * `Ve(uniforms, hex)` — convert a numeric hex colour to linear RGB and write
 * it into the inkRgb uniform. The composite is pre-tonemap, so the value is
 * interpreted in the same space as the material output.
 */
export function setOutlineColor(uniforms: OutlineUniforms, hex: number): void {
  _scratchInkColor.setHex(hex)
  ;(uniforms.inkRgb.value as Vector3).set(
    _scratchInkColor.r,
    _scratchInkColor.g,
    _scratchInkColor.b,
  )
}

// ---------------------------------------------------------------------------
// MRT scene pass — `We()` in source (lines 299–322)
// ---------------------------------------------------------------------------

const RESERVED_MRT_SLOTS = ['output', 'surfaceId', 'outlineExclude'] as const

export interface MakeTechnicalRenderTargetsOptions {
  /**
   * If true, the `outlineExclude` MRT slot reads
   * `vec4(attribute("outlineExclude", "float"), 0, 0, 1)` from the per-vertex
   * attribute. If false (or omitted), it falls back to vec4(0,0,0,1) which
   * means "never exclude".
   */
  hasOutlineExcludeAttribute?: boolean
  /**
   * Optional extra MRT slots keyed by name (each a TSL node).
   * Throws on collision with the three reserved slot names.
   */
  extraSlots?: Record<string, ReturnType<typeof vec4>>
}

export interface TechnicalRenderTargets {
  scenePass: ReturnType<typeof pass>
  scenePassDepth: ReturnType<ReturnType<typeof pass>['getTextureNode']>
  scenePassFill: ReturnType<ReturnType<typeof pass>['getTextureNode']>
  scenePassSurfaceId: ReturnType<ReturnType<typeof pass>['getTextureNode']>
  scenePassOutlineExclude: ReturnType<ReturnType<typeof pass>['getTextureNode']>
  extras: Record<string, ReturnType<ReturnType<typeof pass>['getTextureNode']>>
}

/**
 * `We(scene, camera, options)` — single-pass MRT G-buffer.
 *
 * Writes three reserved slots:
 *   - output         : default scene shaded colour (`re`)
 *   - surfaceId      : vec4(attribute("color","vec3"), 1)
 *   - outlineExclude : vec4(attribute("outlineExclude","float"), 0, 0, 1)  (or zeroed fallback)
 *
 * Plus optional caller-provided extras (collision-checked against reserved keys).
 *
 * The `surfaceId` and `outlineExclude` textures are forced to NearestFilter
 * with `generateMipmaps = false` so id values are not interpolated across
 * triangle boundaries (essential for the discontinuity edge detector).
 */
export function makeTechnicalRenderTargets(
  scene: Scene,
  camera: any,
  options: MakeTechnicalRenderTargetsOptions = {},
): TechnicalRenderTargets {
  const scenePass = pass(scene, camera)

  const slots: Record<string, any> = {
    output,
    surfaceId: vec4(attribute('color', 'vec3'), 1),
    outlineExclude: options.hasOutlineExcludeAttribute
      ? vec4(attribute('outlineExclude', 'float'), 0, 0, 1)
      : vec4(0, 0, 0, 1),
  }

  if (options.extraSlots) {
    for (const key of Object.keys(options.extraSlots)) {
      if ((RESERVED_MRT_SLOTS as readonly string[]).includes(key)) {
        throw new Error(
          `makeTechnicalRenderTargets: extraSlots key "${key}" collides with reserved MRT slot`,
        )
      }
      slots[key] = options.extraSlots[key]
    }
  }

  scenePass.setMRT(mrt(slots))

  // Force ID + exclude textures to nearest-neighbour sampling so values stay
  // exactly the rasterised per-pixel constant (one ID per face).
  for (const slotName of ['surfaceId', 'outlineExclude'] as const) {
    const tex: any = (scenePass as any).getTexture(slotName)
    if (tex) {
      tex.magFilter = NearestFilter
      tex.minFilter = NearestFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
    }
  }

  const extras: Record<string, ReturnType<ReturnType<typeof pass>['getTextureNode']>> = {}
  if (options.extraSlots) {
    for (const key of Object.keys(options.extraSlots)) {
      extras[key] = scenePass.getTextureNode(key)
    }
  }

  return {
    scenePass,
    scenePassDepth: scenePass.getTextureNode('depth'),
    scenePassFill: scenePass.getTextureNode('output'),
    scenePassSurfaceId: scenePass.getTextureNode('surfaceId'),
    scenePassOutlineExclude: scenePass.getTextureNode('outlineExclude'),
    extras,
  }
}

// ---------------------------------------------------------------------------
// Outline composite + final output node — `ke()` + `Ue()` (lines 267–326)
// ---------------------------------------------------------------------------

/**
 * `Ue(targets, uniforms)` — wrap the outline composite in `renderOutput(...)`
 * so the renderer applies tone-mapping + output colour-space encoding AFTER
 * the outline ink is mixed over the linear scene fill.
 *
 * The returned node is intended to be assigned to a PostProcessing instance:
 *
 *   const post = new PostProcessing(renderer)
 *   post.outputNode = makeOutlineOutputNode(targets, uniforms)
 *   post.outputColorTransform = false
 *   post.render()
 */
export function makeOutlineOutputNode(
  targets: TechnicalRenderTargets,
  uniforms: OutlineUniforms,
) {
  const surfaceIdTex = targets.scenePassSurfaceId
  const outlineExcludeTex = targets.scenePassOutlineExclude
  const fillTex = targets.scenePassFill

  // `ke()` — full-screen Fn that detects surfaceId discontinuities and mixes
  // the ink colour over the scene fill.
  const composite = Fn(() => {
    // Centre samples
    const centerExcl = texture(outlineExcludeTex).r
    const centerId = texture(surfaceIdTex).rgb

    // Per-tap exclusion weight: (1 - centerExcl) * (1 - tapExcl)
    // — a neighbour pair contributes only when BOTH endpoints are not excluded.
    const exclWeight = (offsetX: number, offsetY: number) => {
      const off = vec2(offsetX, offsetY).mul(uniforms.invTexelSize)
      const tapExcl = texture(outlineExcludeTex, off).r
      return float(1).sub(centerExcl).mul(float(1).sub(tapExcl))
    }

    // Per-tap id-difference magnitude: length(centerId - tapId)
    const idDiff = (offsetX: number, offsetY: number) => {
      const off = vec2(offsetX, offsetY).mul(uniforms.invTexelSize)
      const tapId = texture(surfaceIdTex, off).rgb
      return length(centerId.sub(tapId))
    }

    // 8-neighbour sum of (idDiff * exclWeight) — 1-texel ring.
    const sum = idDiff(1, 0).mul(exclWeight(1, 0))
      .add(idDiff(-1, 0).mul(exclWeight(-1, 0)))
      .add(idDiff(0, 1).mul(exclWeight(0, 1)))
      .add(idDiff(0, -1).mul(exclWeight(0, -1)))
      .add(idDiff(1, 1).mul(exclWeight(1, 1)))
      .add(idDiff(-1, 1).mul(exclWeight(-1, 1)))
      .add(idDiff(1, -1).mul(exclWeight(1, -1)))
      .add(idDiff(-1, -1).mul(exclWeight(-1, -1)))

    // Binary edge mask, scaled by inkStrength (mix factor in [0, inkStrength]).
    const edge = step(uniforms.idThreshold, sum)
    const inkAmount = edge.mul(uniforms.inkStrength)

    // Composite ink over the linear scene fill.
    const fill = texture(fillTex).rgb
    const composited = mix(fill, uniforms.inkRgb, inkAmount)

    return vec4(composited, 1)
  })

  // `ue(...)` — wrap with renderOutput so the renderer's tone-mapping and
  // output colour-space encoding run after the composite.
  return renderOutput(composite())
}

// ---------------------------------------------------------------------------
// Per-vertex outlineExclude attribute — `Se()` (lines 29–35)
// ---------------------------------------------------------------------------

/**
 * `Se(geometry, value)` — add a 1-component Float32 `outlineExclude` attribute
 * (one per vertex) initialised to `value` (default 0).
 *
 * Caller flips meshes to value=1 to suppress outlines on/around them — the
 * outline composite zeroes any neighbour pair where either side is excluded.
 */
export function addOutlineExcludeAttribute(
  geometry: BufferGeometry,
  value: 0 | 1 = 0,
): void {
  const positions = geometry.getAttribute('position')
  if (!positions) return
  const count = positions.count
  const arr = new Float32Array(count)
  if (value !== 0) arr.fill(value)
  geometry.setAttribute('outlineExclude', new Float32BufferAttribute(arr, 1))
}

// ---------------------------------------------------------------------------
// Surface-ID baking — `Fe()` + `qe()` (lines 175–244)
// ---------------------------------------------------------------------------

/** Classic union-find with path-halving — `Me()` in source. */
class UnionFind {
  parent: Int32Array

  constructor(n: number) {
    this.parent = new Int32Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }

  find(i: number): number {
    let node = i
    while (this.parent[node] !== node) {
      // path-halving
      this.parent[node] = this.parent[this.parent[node]]
      node = this.parent[node]
    }
    return node
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

const _v0 = /* @__PURE__ */ new Vector3()
const _v1 = /* @__PURE__ */ new Vector3()
const _v2 = /* @__PURE__ */ new Vector3()
const _e0 = /* @__PURE__ */ new Vector3()
const _e1 = /* @__PURE__ */ new Vector3()
const _normal = /* @__PURE__ */ new Vector3()

/**
 * Compute a per-triangle surface-id by union-find clustering.
 *
 *   1. Vertex weld at scale ≈ 1e-5 × bbox diagonal so duplicate-position
 *      verts share a `vertexKey` (`we`).
 *   2. Compute per-tri normal + centroid (`be`).
 *   3. Union triangles with identical (orientation-flipped) plane equation:
 *      same normal direction (rounded ×100) and same plane offset bucketed
 *      at scale 1e-4 × bbox diagonal (`ze`).
 *   4. For each shared edge (using vertexKey so welds count), union adjacent
 *      tris whose normals agree within `angleThresholdDeg` (default 50°)
 *      (`Ie`).
 *
 * Returns a compacted id per triangle.
 */
function computeSurfaceIds(
  positions: ArrayLike<number>,
  vertexCount: number,
  indices: ArrayLike<number> | null,
  triCount: number,
  angleThresholdDeg: number,
): Int32Array {
  // Bounding-box diagonal for scale-relative tolerances (`Ae`).
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const dx = maxX - minX
  const dy = maxY - minY
  const dz = maxZ - minZ
  const bboxDiag = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz))

  // Vertex weld — quantise positions into voxel cells (`we`).
  const weldCellSize = bboxDiag * 1e-5
  const vertexKey = new Int32Array(vertexCount)
  const keyMap = new Map<string, number>()
  let nextVertexKey = 0
  for (let i = 0; i < vertexCount; i++) {
    const cx = Math.round(positions[i * 3] / weldCellSize)
    const cy = Math.round(positions[i * 3 + 1] / weldCellSize)
    const cz = Math.round(positions[i * 3 + 2] / weldCellSize)
    const k = `${cx},${cy},${cz}`
    let id = keyMap.get(k)
    if (id === undefined) {
      id = nextVertexKey++
      keyMap.set(k, id)
    }
    vertexKey[i] = id
  }

  // Triangle indices into the position buffer (`be`).
  const triIndices = new Int32Array(triCount * 3)
  if (indices) {
    for (let t = 0; t < triCount; t++) {
      triIndices[t * 3] = indices[t * 3]
      triIndices[t * 3 + 1] = indices[t * 3 + 1]
      triIndices[t * 3 + 2] = indices[t * 3 + 2]
    }
  } else {
    for (let t = 0; t < triCount; t++) {
      triIndices[t * 3] = t * 3
      triIndices[t * 3 + 1] = t * 3 + 1
      triIndices[t * 3 + 2] = t * 3 + 2
    }
  }

  // Per-triangle normal + centroid (`be`).
  const triNormalX = new Float32Array(triCount)
  const triNormalY = new Float32Array(triCount)
  const triNormalZ = new Float32Array(triCount)
  const triPlaneOffset = new Float32Array(triCount)

  for (let t = 0; t < triCount; t++) {
    const a = triIndices[t * 3]
    const b = triIndices[t * 3 + 1]
    const c = triIndices[t * 3 + 2]
    _v0.set(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2])
    _v1.set(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2])
    _v2.set(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2])
    _e0.subVectors(_v1, _v0)
    _e1.subVectors(_v2, _v0)
    _normal.crossVectors(_e0, _e1)
    const len = _normal.length()
    if (len > 0) _normal.divideScalar(len)
    triNormalX[t] = _normal.x
    triNormalY[t] = _normal.y
    triNormalZ[t] = _normal.z
    triPlaneOffset[t] = _normal.dot(_v0)
  }

  const uf = new UnionFind(triCount)

  // Coplanar union (`ze`) — same normal direction (orientation-flipped) and
  // same plane offset, bucketed at scale 1e-4 × bbox diagonal.
  const planeQuantum = bboxDiag * 1e-4
  const planeMap = new Map<string, number>()
  for (let t = 0; t < triCount; t++) {
    let nx = triNormalX[t]
    let ny = triNormalY[t]
    let nz = triNormalZ[t]
    let off = triPlaneOffset[t]
    // Canonicalise orientation so flipped duplicates collide.
    if (nx < 0 || (nx === 0 && (ny < 0 || (ny === 0 && nz < 0)))) {
      nx = -nx; ny = -ny; nz = -nz; off = -off
    }
    const nxq = Math.round(nx * 100)
    const nyq = Math.round(ny * 100)
    const nzq = Math.round(nz * 100)
    const offq = planeQuantum > 0 ? Math.round(off / planeQuantum) : 0
    const key = `${nxq},${nyq},${nzq}|${offq}`
    const existing = planeMap.get(key)
    if (existing === undefined) planeMap.set(key, t)
    else uf.union(existing, t)
  }

  // Edge-adjacent union (`Ie`) — share an edge via vertexKey, normals within
  // angleThresholdDeg degrees.
  const cosThreshold = Math.cos((angleThresholdDeg * Math.PI) / 180)
  const edgeMap = new Map<string, number>()
  const edgeKey = (va: number, vb: number) => (va < vb ? `${va}_${vb}` : `${vb}_${va}`)

  for (let t = 0; t < triCount; t++) {
    const a = vertexKey[triIndices[t * 3]]
    const b = vertexKey[triIndices[t * 3 + 1]]
    const c = vertexKey[triIndices[t * 3 + 2]]
    const e: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ]
    for (const [u, v] of e) {
      const k = edgeKey(u, v)
      const other = edgeMap.get(k)
      if (other === undefined) {
        edgeMap.set(k, t)
      } else {
        const dot =
          triNormalX[t] * triNormalX[other] +
          triNormalY[t] * triNormalY[other] +
          triNormalZ[t] * triNormalZ[other]
        if (Math.abs(dot) >= cosThreshold) uf.union(t, other)
      }
    }
  }

  // Compact ids: assign 0..K-1 in encounter order.
  const compact = new Int32Array(triCount)
  const idMap = new Map<number, number>()
  let nextId = 0
  for (let t = 0; t < triCount; t++) {
    const root = uf.find(t)
    let id = idMap.get(root)
    if (id === undefined) {
      id = nextId++
      idMap.set(root, id)
    }
    compact[t] = id
  }
  return compact
}

// ---------------------------------------------------------------------------
// Golden-ratio HSL palette — `je` / `Oe()` (lines 245–263)
// ---------------------------------------------------------------------------

const GOLDEN_RATIO_HUE_STEP = 0.61803398875
const PALETTE_SATURATION = 0.9
const PALETTE_LIGHTNESS = 0.5

const _scratchPaletteColor = /* @__PURE__ */ new Color()

/** `Oe(n)` — golden-ratio HSL hue → packed hex. */
function paletteHexForIndex(index: number): number {
  const hue = ((index + 1) * GOLDEN_RATIO_HUE_STEP) % 1
  _scratchPaletteColor.setHSL(hue, PALETTE_SATURATION, PALETTE_LIGHTNESS)
  return _scratchPaletteColor.getHex()
}

/**
 * `je` — keyed palette that hands out a unique golden-ratio HSL hex colour
 * per key. Repeated `colorForKey(key)` calls return the same hex.
 */
export class SurfaceIdPalette {
  private map = new Map<string, number>()
  private next = 0

  /**
   * Standalone helper exposing the underlying generator without the keyed map.
   * `SurfaceIdPalette.colorForIndex(0)` returns the first golden-ratio hex.
   */
  static colorForIndex(index: number): number {
    return paletteHexForIndex(index)
  }

  colorForKey(key: string): number {
    let i = this.map.get(key)
    if (i === undefined) {
      i = this.next++
      this.map.set(key, i)
    }
    return paletteHexForIndex(i)
  }

  reset(): void {
    this.map.clear()
    this.next = 0
  }
}

// ---------------------------------------------------------------------------
// `Fe()` — bake surfaceId into a single geometry
// `qe()` — walk a scene and bake every Mesh
// ---------------------------------------------------------------------------

export interface BakeSurfaceIdsOptions {
  /**
   * Optional palette to share across multiple geometries (so the same
   * surfaceId across meshes hashes to the same colour). If omitted, a
   * geometry-local palette is created.
   */
  palette?: SurfaceIdPalette
  /**
   * Mesh label used as the prefix for palette keys: `${label}:${surfaceId}`.
   * Default `"mesh"`.
   */
  label?: string
  /**
   * Angular tolerance for treating edge-adjacent triangles as the same
   * surface. Default 50°. Above this they remain separate ids.
   */
  angleThresholdDeg?: number
}

/**
 * `Fe(geometry, palette, label)` — bake per-triangle surface-ids into the
 * `color` vertex attribute and rebuild the geometry as un-indexed (one tri
 * = 3 unique vertices).
 *
 * Steps (verbatim to source):
 *   1. Strip `uv`, `uv2`, `tangent`, drop the index.
 *   2. Compute per-triangle surfaceId via `computeSurfaceIds(...)`.
 *   3. Rebuild un-indexed `position` (9 floats per triangle) and a matching
 *      `color` attribute (3 floats per vertex), where all 3 vertices of a
 *      triangle receive the palette colour for that triangle's id.
 *   4. Recompute vertex normals (used by the underlying material — not the
 *      outline pass).
 *   5. Add `outlineExclude = 0` per-vertex.
 */
export function bakeSurfaceIdsForGeometry(
  geometry: BufferGeometry,
  opts: BakeSurfaceIdsOptions = {},
): void {
  const positionAttr = geometry.getAttribute('position')
  if (!positionAttr) return

  const palette = opts.palette ?? new SurfaceIdPalette()
  const label = opts.label ?? 'mesh'
  const angle = opts.angleThresholdDeg ?? 50

  // Read source positions / index BEFORE we mutate the geometry.
  const sourcePositions = positionAttr.array as ArrayLike<number>
  const sourceVertexCount = positionAttr.count
  const sourceIndex = geometry.getIndex()
  const sourceIndices = sourceIndex ? (sourceIndex.array as ArrayLike<number>) : null
  const triCount = sourceIndices ? sourceIndices.length / 3 : sourceVertexCount / 3

  // Strip attributes that we explicitly do not want propagated.
  geometry.deleteAttribute('uv')
  geometry.deleteAttribute('uv2')
  geometry.deleteAttribute('tangent')

  const surfaceIds = computeSurfaceIds(
    sourcePositions,
    sourceVertexCount,
    sourceIndices,
    triCount,
    angle,
  )

  // Rebuild un-indexed position + color (3 unique vertices per triangle).
  const newPositions = new Float32Array(triCount * 9)
  const newColors = new Float32Array(triCount * 9)

  for (let t = 0; t < triCount; t++) {
    const a = sourceIndices ? sourceIndices[t * 3] : t * 3
    const b = sourceIndices ? sourceIndices[t * 3 + 1] : t * 3 + 1
    const c = sourceIndices ? sourceIndices[t * 3 + 2] : t * 3 + 2

    // positions
    newPositions[t * 9 + 0] = sourcePositions[a * 3 + 0]
    newPositions[t * 9 + 1] = sourcePositions[a * 3 + 1]
    newPositions[t * 9 + 2] = sourcePositions[a * 3 + 2]
    newPositions[t * 9 + 3] = sourcePositions[b * 3 + 0]
    newPositions[t * 9 + 4] = sourcePositions[b * 3 + 1]
    newPositions[t * 9 + 5] = sourcePositions[b * 3 + 2]
    newPositions[t * 9 + 6] = sourcePositions[c * 3 + 0]
    newPositions[t * 9 + 7] = sourcePositions[c * 3 + 1]
    newPositions[t * 9 + 8] = sourcePositions[c * 3 + 2]

    // surfaceId → palette colour, replicated to all 3 vertices.
    const hex = palette.colorForKey(`${label}:${surfaceIds[t]}`)
    const r = ((hex >> 16) & 0xff) / 255
    const g = ((hex >> 8) & 0xff) / 255
    const b3 = (hex & 0xff) / 255
    for (let v = 0; v < 3; v++) {
      newColors[t * 9 + v * 3 + 0] = r
      newColors[t * 9 + v * 3 + 1] = g
      newColors[t * 9 + v * 3 + 2] = b3
    }
  }

  geometry.setIndex(null)
  geometry.setAttribute('position', new BufferAttribute(newPositions, 3))
  geometry.setAttribute('color', new BufferAttribute(newColors, 3))
  geometry.deleteAttribute('normal')
  geometry.computeVertexNormals()

  // Initialise the per-vertex outlineExclude attribute to 0.
  addOutlineExcludeAttribute(geometry, 0)
}

/**
 * `qe(scene)` — walk every Mesh descendant and bake surface-ids into its
 * geometry. Optionally pass a shared palette so ids align across meshes.
 */
export function bakeSurfaceIdsForScene(
  scene: Scene | Object3D,
  opts: BakeSurfaceIdsOptions = {},
): void {
  const palette = opts.palette ?? new SurfaceIdPalette()
  let meshIndex = 0
  scene.traverse((obj) => {
    if ((obj as Mesh).isMesh) {
      const mesh = obj as Mesh
      const geom = mesh.geometry as BufferGeometry | undefined
      if (!geom) return
      bakeSurfaceIdsForGeometry(geom, {
        palette,
        label: `mesh${meshIndex}`,
        angleThresholdDeg: opts.angleThresholdDeg,
      })
      meshIndex += 1
    }
  })
}
