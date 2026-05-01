<script setup lang="ts">
import * as THREE from 'three'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { getThemeColor } from '~~/composables/useThemeColors'
import { makeRailCutMaterial } from '~~/shared/three/materials'

interface Props {
  /** Width on the panel surface (X), metres. */
  width: number
  /** Height on the panel surface (Y), metres. */
  height: number
  /** Local Z offset relative to the panel (typically ±(thickness/2 + 0.6mm)). */
  zOffset?: number
  /** Local X centre on the panel surface, metres. */
  x?: number
  /** Local Y centre on the panel surface, metres. */
  y?: number
  /** Override outline color (defaults to primary500). */
  color?: number
}

const props = withDefaults(defineProps<Props>(), {
  zOffset: 0,
  x: 0,
  y: 0,
})

const meshRef = shallowRef<THREE.Mesh | null>(null)
let geometry: THREE.PlaneGeometry | null = null
let materialInstance: THREE.Material | null = null

function disposeCurrent() {
  if (geometry) {
    geometry.dispose()
    geometry = null
  }
  if (materialInstance) {
    materialInstance.dispose()
    materialInstance = null
  }
}

function build(): THREE.Mesh {
  disposeCurrent()
  const w = Math.max(0.0005, props.width)
  const h = Math.max(0.0005, props.height)
  geometry = new THREE.PlaneGeometry(w, h)
  const color = props.color ?? getThemeColor('primary500').hex
  materialInstance = makeRailCutMaterial(color, 0.6)
  const mesh = new THREE.Mesh(geometry, materialInstance)
  mesh.position.set(props.x, props.y, props.zOffset)
  mesh.name = 'rail-cut-overlay'
  meshRef.value = mesh
  return mesh
}

build()

watch(
  () => [props.width, props.height, props.zOffset, props.x, props.y, props.color],
  () => {
    const old = meshRef.value
    const next = build()
    if (old?.parent) {
      const parent = old.parent
      parent.remove(old)
      parent.add(next)
    }
  },
)

onBeforeUnmount(() => {
  if (meshRef.value?.parent) meshRef.value.parent.remove(meshRef.value)
  disposeCurrent()
  meshRef.value = null
})

defineExpose({
  getMesh: () => meshRef.value,
})
</script>

<template>
  <!-- Headless. The Three.Mesh is exposed via `getMesh()`. -->
</template>
