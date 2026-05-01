/**
 * Frame-rate-independent lerp / slerp helpers.
 *
 * Spec source: _spec/03_three_scene.md (Per-frame interpolation `Fa`, L6610–6629)
 *   Original obfuscated source: _chunks/beautified/Dt_x5Iy5.js
 *
 * The original `Fa(delta)` uses `D = 1 - exp(-10 * delta)` as an exponential
 * ease-out. The same formulation is used here, with `lambda` (1/τ) configurable
 * — a higher lambda converges faster.
 *
 * `lambda = 10` ≈ time-constant of 100 ms.
 */

import { Quaternion, Vector3 } from 'three'

/** Compute the per-frame interpolation factor (0..1) for the given dt + lambda. */
function exponentialEaseFactor(dt: number, lambda: number): number {
  if (dt <= 0) return 0
  return 1 - Math.exp(-lambda * dt)
}

/**
 * Approach `target` from `current` by an exponential ease-out factor in place.
 * No-op (returns `current` unchanged) once the squared distance falls below 1e-8.
 *
 * @param target  destination vector (read-only)
 * @param current vector to mutate towards `target`
 * @param dt      seconds since the last call
 * @param lambda  1/τ — higher = snappier (default 10 → ~100 ms time-constant)
 */
export function approachVec3(
  target: Vector3,
  current: Vector3,
  dt: number,
  lambda: number = 10,
): Vector3 {
  if (current.distanceToSquared(target) <= 1e-8) return current
  const factor = exponentialEaseFactor(dt, lambda)
  current.lerp(target, factor)
  return current
}

/**
 * Approach `target` rotation from `current` via slerp by an exponential
 * ease-out factor in place. No-op once the angle delta falls below 1e-5 rad.
 */
export function approachQuat(
  target: Quaternion,
  current: Quaternion,
  dt: number,
  lambda: number = 10,
): Quaternion {
  if (current.angleTo(target) <= 1e-5) return current
  const factor = exponentialEaseFactor(dt, lambda)
  current.slerp(target, factor)
  return current
}
