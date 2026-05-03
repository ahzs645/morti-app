/**
 * Procedural wood-grain DataTextures, generated per species.
 *
 * Each texture is a grayscale (single-channel, broadcast to RGB) noise pattern
 * that we multiply against the base color in the fragment shader via triplanar
 * world-space mapping. No image assets, no async loading — generated once at
 * first use and cached forever.
 *
 * Visual recipes mirror the picker's CSS grain patterns so the chip and the
 * 3D panel are in the same visual key.
 */

import * as THREE from 'three'
import type { MaterialGrain } from '~~/shared/domain/materials'

interface GrainSpec {
  /** Stripe frequency along grain direction (0..1, higher = tighter). */
  freq: number
  /** Cross-stripe noise amount (0..1, higher = wavier). */
  wobble: number
  /** Contrast: max delta away from 1.0 brightness. */
  contrast: number
  /** Grain orientation in radians (0 = horizontal stripes). */
  angle: number
  /** Optional ply-edge banding amplitude (0 = none). */
  ply: number
}

const SPEC: Record<MaterialGrain, GrainSpec | null> = {
  oak:               { freq: 0.18, wobble: 0.45, contrast: 0.18, angle: 0,           ply: 0    },
  walnut:            { freq: 0.32, wobble: 0.55, contrast: 0.28, angle: 0.05,        ply: 0    },
  maple:             { freq: 0.45, wobble: 0.18, contrast: 0.06, angle: 0,           ply: 0    },
  birch:             { freq: 0.10, wobble: 0.20, contrast: 0.14, angle: Math.PI / 2, ply: 0.15 },
  ebonized:          { freq: 0.55, wobble: 0.30, contrast: 0.32, angle: 0.02,        ply: 0    },
  cherry:            { freq: 0.22, wobble: 0.40, contrast: 0.14, angle: 0,           ply: 0    },
  'lacquer-white':    null,
  'lacquer-charcoal': null,
  custom:             null,
}

const TEX_SIZE = 256

const cache = new Map<MaterialGrain, THREE.DataTexture | null>()

/** Mulberry32 — tiny, fast, deterministic PRNG. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 2D smoothed value-noise — coarse + medium octaves are enough for wood. */
function valueNoise2D(rng: () => number, w: number, h: number) {
  const data = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) data[i] = rng()
  // 3-tap horizontal blur for soft variation along the cross-grain axis.
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[y * w + ((x - 1 + w) % w)]
      const b = data[y * w + x]
      const c = data[y * w + ((x + 1) % w)]
      out[y * w + x] = (a + b + c) / 3
    }
  }
  return out
}

function generateGrain(grain: MaterialGrain): THREE.DataTexture | null {
  const spec = SPEC[grain]
  if (!spec) return null

  const w = TEX_SIZE
  const h = TEX_SIZE
  const data = new Uint8Array(w * h * 4)

  // Use grain name as deterministic seed so HMR doesn't reroll patterns.
  let seed = 0
  for (let i = 0; i < grain.length; i++) seed = (seed * 31 + grain.charCodeAt(i)) | 0
  const rng = makeRng(seed)
  const noise = valueNoise2D(rng, w, h)

  const cosA = Math.cos(spec.angle)
  const sinA = Math.sin(spec.angle)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Rotate sample coord into grain space.
      const u = (x / w) * cosA + (y / h) * sinA
      const v = (y / h) * cosA - (x / w) * sinA

      // Cross-grain wobble — push stripe positions around with low-freq noise.
      const nx = Math.floor(((u * 4) % 1 + 1) % 1 * w) | 0
      const ny = Math.floor(((v * 4) % 1 + 1) % 1 * h) | 0
      const wobble = (noise[ny * w + nx] - 0.5) * spec.wobble

      // Base stripe pattern: cosine across grain, period = 1 / freq.
      const stripe = Math.cos((v + wobble) * Math.PI * 2 / Math.max(0.02, spec.freq))

      // Optional plywood ply-edge banding.
      let ply = 0
      if (spec.ply > 0) {
        const band = Math.cos(v * Math.PI * 2 / 0.08)
        ply = band > 0.92 ? spec.ply : 0
      }

      const value = 1 - stripe * spec.contrast * 0.5 + ply
      const clamped = Math.max(0.5, Math.min(1.15, value))
      const byte = Math.round(clamped * 200) // 0.5→100, 1.0→200, 1.15→230 (multiplier baked into shader)

      const o = (y * w + x) * 4
      data[o] = byte
      data[o + 1] = byte
      data[o + 2] = byte
      data[o + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

export function getGrainTexture(grain: MaterialGrain): THREE.DataTexture | null {
  if (cache.has(grain)) return cache.get(grain) ?? null
  const tex = generateGrain(grain)
  cache.set(grain, tex)
  return tex
}

/** Disposed on page-level cleanup. Safe to call multiple times. */
export function disposeGrainTextures(): void {
  for (const tex of cache.values()) tex?.dispose()
  cache.clear()
}
