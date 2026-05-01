/**
 * OrbitControls + camera-fit helpers.
 *
 * Spec source: _spec/03_three_scene.md (Camera + OrbitControls + fit-to-bounds, L6878–6944)
 *   Original obfuscated source: _chunks/beautified/Dt_x5Iy5.js
 *
 * The configuration here matches the DesignerCanvas verbatim:
 *   - damping factor 0.06
 *   - pan + zoom disabled (zoom is handled by `applyWheelZoom` so we can clamp
 *     the distance ratio against `te.designerWheelZoomMaxDistanceRatio`)
 *   - polar angle clamped to [8°, 88°]
 *   - target = (0, halfHeight, 0) initially
 *
 * `autoFitCamera` re-runs every frame in the original (`Ao()`), reading the
 * scene's bounding sphere and locking min/max distance so the camera fits
 * the scene with the per-mode `padding` multiplier (default 1.12 = `Lh`).
 */

import {
  Box3,
  MathUtils,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'

import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Verbatim values from BNlvPyv_.js L1–12 (`yt`).
const ORBIT_DAMPING = 0.06
const ORBIT_MIN_POLAR_DEG = 8
const ORBIT_MAX_POLAR_DEG = 88
const WHEEL_ZOOM_SENSITIVITY = 0.0011
const WHEEL_ZOOM_MIN_RATIO = 1
const WHEEL_ZOOM_MAX_RATIO = 2.75
const FIT_PADDING = 1.12 // `Lh`
const MIN_FIT_DISTANCE = 8 // `te.designerOrbitMinDistanceM`

/**
 * Configure an OrbitControls instance with the Morti defaults.
 * Note: zoom is intentionally disabled — wheel zoom is handled externally
 * via `applyWheelZoom(...)` so we can clamp the distance ratio.
 */
export function configureOrbit(controls: OrbitControls): void {
  controls.enableDamping = true
  controls.dampingFactor = ORBIT_DAMPING
  controls.enablePan = false
  controls.enableZoom = false
  controls.minPolarAngle = MathUtils.degToRad(ORBIT_MIN_POLAR_DEG)
  controls.maxPolarAngle = MathUtils.degToRad(ORBIT_MAX_POLAR_DEG)
  // rotateSpeed left at the OrbitControls default (1).
}

/**
 * Apply a wheel-event delta to a mutable distance-ratio container, clamped
 * to [WHEEL_ZOOM_MIN_RATIO, WHEEL_ZOOM_MAX_RATIO]. Returns the new ratio.
 *
 * Mirrors `go()` (Dt_x5Iy5.js L6586–6593) — the deltaY is clamped to ±140
 * before being mapped through `exp(deltaY * sensitivity)`.
 *
 * The actual orbit distance is recomputed each frame inside `autoFitCamera`
 * using this ratio as a multiplier on the fit distance.
 */
export function applyWheelZoom(currentRatio: number, deltaY: number): number {
  const clamped = Math.max(-140, Math.min(140, deltaY))
  const next = currentRatio * Math.exp(clamped * WHEEL_ZOOM_SENSITIVITY)
  return Math.min(WHEEL_ZOOM_MAX_RATIO, Math.max(WHEEL_ZOOM_MIN_RATIO, next))
}

const _scratchBox = /* @__PURE__ */ new Box3()
const _scratchSphere = /* @__PURE__ */ new Sphere()
const _scratchCenter = /* @__PURE__ */ new Vector3()
const _scratchDir = /* @__PURE__ */ new Vector3()
const _fallbackDir = /* @__PURE__ */ new Vector3(1, 0.55, 1).normalize()

export interface AutoFitOptions {
  /** Wheel-zoom ratio in [1, 2.75]. Default 1 (fully fit). */
  wheelZoomRatio?: number
  /** Padding multiplier on the computed fit distance. Default 1.12. */
  padding?: number
}

/**
 * Fit camera to the bounding sphere of `scene` and lock orbit distance.
 *
 * Steps (verbatim to `Ao()`):
 *   1. Compute Box3 of the scene; if empty, fall back to a small sphere at
 *      the origin so the camera doesn't shoot to infinity.
 *   2. Derive the bounding sphere; clamp degenerate radii to 0.35.
 *   3. Compute the V-FOV-fit and H-FOV-fit distances; take the larger.
 *   4. Multiply by `padding` (1.12), then floor at MIN_FIT_DISTANCE (8 m).
 *   5. Multiply by the wheel-zoom ratio (clamped to [1, 2.75]).
 *   6. Preserve the current view direction; reposition the camera at
 *      `center + dir * Z`; lock min/maxDistance to Z; reset target to center.
 */
export function autoFitCamera(
  scene: Object3D,
  camera: Camera,
  controls: OrbitControls,
  padding: number = FIT_PADDING,
  options: AutoFitOptions = {},
): void {
  if (!(camera as PerspectiveCamera).isPerspectiveCamera) {
    // Only perspective is documented; ortho cameras would need a different fit.
    return
  }
  const persp = camera as PerspectiveCamera
  const wheelRatio = options.wheelZoomRatio ?? 1
  const paddingFactor = options.padding ?? padding

  _scratchBox.setFromObject(scene)

  if (_scratchBox.isEmpty()) {
    _scratchCenter.set(0, 0, 0)
    _scratchSphere.center.copy(_scratchCenter)
    _scratchSphere.radius = 0.35
  } else {
    _scratchBox.getCenter(_scratchCenter)
    _scratchBox.getBoundingSphere(_scratchSphere)
    if (!Number.isFinite(_scratchSphere.radius) || _scratchSphere.radius < 1e-4) {
      _scratchSphere.radius = 0.35
    }
  }

  const vFov = MathUtils.degToRad(persp.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * persp.aspect)
  const distV = _scratchSphere.radius / Math.sin(Math.max(1e-4, vFov * 0.5))
  const distH = _scratchSphere.radius / Math.sin(Math.max(1e-4, hFov * 0.5))
  const fit = Math.max(distV, distH, 0.001) * paddingFactor
  const floored = Math.max(fit, MIN_FIT_DISTANCE)
  const wheelClamp = Math.max(WHEEL_ZOOM_MIN_RATIO, Math.min(WHEEL_ZOOM_MAX_RATIO, wheelRatio))
  const finalDistance = floored * wheelClamp

  // Preserve view direction.
  _scratchDir.copy(persp.position).sub(controls.target)
  if (_scratchDir.lengthSq() < 1e-8) _scratchDir.copy(_fallbackDir)
  else _scratchDir.normalize()

  controls.target.copy(_scratchCenter)
  persp.position.copy(_scratchCenter).addScaledVector(_scratchDir, finalDistance)

  controls.minDistance = finalDistance
  controls.maxDistance = finalDistance
  controls.update()
}
