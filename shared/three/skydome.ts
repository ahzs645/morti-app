/**
 * Skydome — large back-side sphere with a TSL gradient between ground and sky
 * colours, smoothstepped along `positionLocal.y`.
 *
 * Spec source: _spec/03_three_scene.md (Skydome / RenderDebugSkydome, L373–407)
 *   Original obfuscated source: _chunks/beautified/Dt_x5Iy5.js (`ll`)
 *
 * The skydome is wired up but currently never enabled in the production
 * DesignerCanvas (`K.setVisible(false)` is called both at construction and
 * every frame). Default `visible=false` keeps that behaviour but the helper
 * `setVisible(true)` is exposed for future use.
 */

import {
  BackSide,
  Color,
  Mesh,
  SphereGeometry,
  Vector3,
} from 'three'

import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  mix,
  positionLocal,
  smoothstep,
  uniform,
  vec4,
} from 'three/tsl'

export interface Skydome {
  mesh: Mesh
  setVisible: (visible: boolean) => void
  /**
   * Update colours (and optional horizon parameters) at runtime.
   *   - groundHex / skyHex: hex ints for ground and sky.
   *   - yPos:               world-Y origin of the dome (default 0).
   *   - horizonY:           local-Y centre of the horizon band (default 0).
   *   - horizonBand:        thickness of the smoothstep band (default 1).
   */
  sync: (
    groundHex: number,
    skyHex: number,
    yPos?: number,
    horizonY?: number,
    horizonBand?: number,
  ) => void
  dispose: () => void
}

const DEFAULT_RADIUS = 10

/**
 * `ll(skydomeRadius)` — build a back-side sphere with the gradient material
 * and a small reactive uniform set for runtime recolouring.
 */
export function createSkydome(
  radius: number = DEFAULT_RADIUS,
  groundHex?: number,
  skyHex?: number,
): Skydome {
  // Uniforms — ground & sky colours, plus a horizon band.
  const groundColor = new Color(groundHex ?? 0x333333)
  const skyColor = new Color(skyHex ?? 0x7388bf)
  const groundUniform = uniform(new Vector3(groundColor.r, groundColor.g, groundColor.b))
  const skyUniform = uniform(new Vector3(skyColor.r, skyColor.g, skyColor.b))
  const horizonLowerUniform = uniform(0)
  const horizonUpperUniform = uniform(1)

  const material = new MeshBasicNodeMaterial()
  material.colorNode = Fn(() => {
    const t = smoothstep(horizonLowerUniform, horizonUpperUniform, positionLocal.y)
    return vec4(mix(groundUniform, skyUniform, t), 1)
  })()
  material.side = BackSide
  ;(material as any).depthWrite = false

  const geometry = new SphereGeometry(radius, 48, 24)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.name = 'RenderDebugSkydome'
  mesh.visible = false

  return {
    mesh,
    setVisible(visible: boolean) {
      mesh.visible = visible
    },
    sync(gHex, sHex, yPos = 0, horizonY = 0, horizonBand = 1) {
      const g = new Color().setHex(gHex)
      groundUniform.value.set(g.r, g.g, g.b)
      const s = new Color().setHex(sHex)
      skyUniform.value.set(s.r, s.g, s.b)
      mesh.position.set(0, yPos, 0)
      const halfBand = Math.max(0.05, horizonBand) * 0.5
      horizonLowerUniform.value = horizonY - halfBand
      horizonUpperUniform.value = horizonY + halfBand
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
