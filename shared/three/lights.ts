/**
 * Scene lighting rig.
 *
 * Spec source: _spec/03_three_scene.md (Lighting Rig Summary L1080–1125)
 *   Original obfuscated source: _chunks/beautified/Dt_x5Iy5.js L6814–6868
 *
 * Three lighting modes mapped from `renderMode`:
 *   - 'rendered'     (default UI)         : ambient 0.4, key 1.15 noShadow, no hemi
 *   - 'render-debug' (lit preview)        : ambient 0.5, key 2.0 castShadow, hemi 2.0
 *   - 'technical'    (outline-only path)  : same lights as 'rendered' (the
 *                                            technical look is achieved by the
 *                                            outline post-processing pipeline,
 *                                            not by changing the lighting).
 *
 * The HemisphereLight is only constructed for 'render-debug' (it is added /
 * removed via the `Ke` group in the original; here we just omit it from the
 * returned object on the other modes).
 */

import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
} from 'three'

export type LightingMode = 'rendered' | 'render-debug' | 'technical'

export interface SceneLights {
  /** AmbientLight — wraps everything in flat fill light. */
  ambient: AmbientLight
  /** DirectionalLight — main key light, optionally casts shadows. */
  key: DirectionalLight
  /** HemisphereLight — only present for 'render-debug'. */
  hemi?: HemisphereLight
}

/**
 * Build a fresh lighting rig for the given mode. The caller is responsible
 * for `scene.add(...)`-ing each member and adding `key.target` separately
 * (Three.js requires the target to be in the scene graph for shadows).
 */
export function buildSceneLights(mode: LightingMode): SceneLights {
  // Ambient — intensity differs by mode.
  const ambientIntensity = mode === 'render-debug' ? 0.5 : 0.4
  const ambient = new AmbientLight(0xffffff, ambientIntensity)

  // Directional key light — always present, only intensity + castShadow vary.
  const keyIntensity = mode === 'render-debug' ? 2 : 1.15
  const key = new DirectionalLight(0xffffff, keyIntensity)
  key.position.set(4, 6, 3)
  key.target.position.set(0, 0, 0)
  key.castShadow = mode === 'render-debug'

  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.00015
  key.shadow.normalBias = 0.045
  key.shadow.radius = 2
  key.shadow.camera.left = -10
  key.shadow.camera.right = 10
  key.shadow.camera.top = 10
  key.shadow.camera.bottom = -10
  key.shadow.camera.near = 0.08
  key.shadow.camera.far = 42
  key.shadow.camera.updateProjectionMatrix()

  // Hemisphere fill — render-debug only (added/removed via `Ke` group in source).
  let hemi: HemisphereLight | undefined
  if (mode === 'render-debug') {
    hemi = new HemisphereLight(0xffffff, 0x334455, 2)
  }

  return { ambient, key, hemi }
}
