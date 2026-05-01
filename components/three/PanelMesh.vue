<script setup lang="ts">
import * as THREE from 'three'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { compilePartGeometry } from '~~/shared/domain/assembly'
import {
  addOutlineExcludeAttribute,
  bakeSurfaceIdsForGeometry,
  SurfaceIdPalette,
} from '~~/shared/three/outline'
import { makePanelMaterial, type PanelMaterialMode } from '~~/shared/three/materials'
import type { CompiledPanel, PanelOperation } from '~~/shared/domain/types'

interface Props {
  panel: CompiledPanel
  operations: PanelOperation[]
  material?: PanelMaterialMode
  color?: number
}

const props = withDefaults(defineProps<Props>(), {
  material: 'shaded',
  color: 0xaaaaaa,
})

const meshRef = shallowRef<THREE.Mesh | null>(null)
let geometry: THREE.BufferGeometry | null = null
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
  geometry = compilePartGeometry(props.panel, props.operations)
  // Bake surface IDs for the technical outline pass.
  bakeSurfaceIdsForGeometry(geometry, {
    palette: new SurfaceIdPalette(),
    label: props.panel.key,
  })
  // Mark every vertex as included in the outline pass (value=0).
  addOutlineExcludeAttribute(geometry, 0)

  materialInstance = makePanelMaterial(props.material, props.color)

  const mesh = new THREE.Mesh(geometry, materialInstance)
  mesh.castShadow = props.material === 'shaded'
  mesh.receiveShadow = props.material === 'shaded'
  mesh.position.set(props.panel.position[0], props.panel.position[1], props.panel.position[2])
  mesh.rotation.set(props.panel.rotation[0], props.panel.rotation[1], props.panel.rotation[2])
  mesh.name = `panel:${props.panel.key}`
  meshRef.value = mesh
  return mesh
}

build()

watch(
  () => [props.panel, props.operations, props.material, props.color],
  () => {
    const old = meshRef.value
    const next = build()
    if (old?.parent) {
      const parent = old.parent
      parent.remove(old)
      parent.add(next)
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (meshRef.value?.parent) meshRef.value.parent.remove(meshRef.value)
  disposeCurrent()
  meshRef.value = null
})

defineExpose({
  /** Returns the underlying Three.Mesh. */
  getMesh: () => meshRef.value,
})
</script>

<template>
  <!--
    PanelMesh has no DOM. Its existence is purely the imperative Three.Mesh
    exposed via `getMesh()`. Parents add `getMesh()` to their scene graph.
  -->
</template>
