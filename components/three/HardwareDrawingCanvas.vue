<script setup lang="ts">
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { useThemeColors, getThemeColor } from '~~/composables/useThemeColors'
import { useThreejsCanvas } from '~~/composables/useThreejsCanvas'
import type { HardwareSpec } from '~~/shared/domain/types'

interface Props {
  spec: HardwareSpec
}

const props = defineProps<Props>()

const wrapperRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { colors } = useThemeColors()

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(5, 1, 0.001, 100)
const modelGroup = new THREE.Group()
scene.add(modelGroup)

const camDir = new THREE.Vector3(1.6, 1.1, 1.8).normalize()
const focusTarget = new THREE.Vector3()

const loader = new GLTFLoader()

function disposeMaterial(mat: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(mat) ? mat : [mat]
  for (const m of list) {
    for (const k of Object.keys(m) as (keyof THREE.Material)[]) {
      const v = (m as any)[k]
      if (v && typeof v === 'object' && 'isTexture' in v && (v as THREE.Texture).isTexture) {
        ;(v as THREE.Texture).dispose()
      }
    }
    m.dispose()
  }
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      if (mesh.material) disposeMaterial(mesh.material)
    }
  })
}

function clearGroup() {
  while (modelGroup.children.length > 0) {
    const c = modelGroup.children[0]
    modelGroup.remove(c)
    disposeObject(c)
  }
}

function flattenMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const old = mesh.material
    mesh.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors.value.backgroundDefault.hex),
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
    if (old) disposeMaterial(old)
  })
}

function frameCamera(target: THREE.Object3D) {
  const bbox = new THREE.Box3().setFromObject(target)
  if (bbox.isEmpty()) return
  const sphere = new THREE.Sphere()
  bbox.getBoundingSphere(sphere)
  if (!isFinite(sphere.radius) || sphere.radius < 1e-4) sphere.radius = 0.05
  focusTarget.copy(sphere.center)
  const fov = (camera.fov * Math.PI) / 180
  const dist = Math.max(0.08, (sphere.radius / Math.sin(Math.max(1e-4, fov / 2))) * 1.15)
  camera.position.copy(focusTarget).addScaledVector(camDir, dist)
  camera.lookAt(focusTarget)
}

async function loadModel() {
  clearGroup()
  if (!props.spec?.modelGlbSrc) return
  try {
    const gltf = await loader.loadAsync(props.spec.modelGlbSrc)
    flattenMaterials(gltf.scene)
    modelGroup.add(gltf.scene)
    frameCamera(gltf.scene)
  }
  catch {
    // eslint-disable-next-line no-console
    console.warn(`[HardwareDrawingCanvas] Failed to load ${props.spec.modelGlbSrc}`)
  }
}

const sceneRef = shallowRef(scene)
const cameraRef = shallowRef<THREE.Camera>(camera)

useThreejsCanvas({
  canvasRef,
  scene: sceneRef,
  camera: cameraRef,
  clearColor: getThemeColor('backgroundDefault').hex,
  clearAlpha: 1,
  render(renderer) {
    renderer.setClearColor(new THREE.Color(colors.value.backgroundDefault.hex), 1)
    renderer.render(scene, camera)
  },
})

watch(
  () => colors.value.generation,
  () => {
    // Recolor existing meshes to new background.
    modelGroup.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      ;(mesh.material as THREE.MeshBasicMaterial).color = new THREE.Color(colors.value.backgroundDefault.hex)
    })
  },
)

watch(() => props.spec?.modelGlbSrc, () => {
  void loadModel()
})

onMounted(() => {
  nextTick(() => {
    void loadModel()
  })
})

onBeforeUnmount(() => {
  clearGroup()
})

const ariaLabel = computed(() => `${props.spec.code} ${props.spec.name} model preview`)
</script>

<template>
  <div
    ref="wrapperRef"
    class="size-28 overflow-hidden rounded-md bg-default shadow-sm ring-1 ring-default/60"
    :aria-label="ariaLabel"
  >
    <canvas ref="canvasRef" class="block size-full" />
  </div>
</template>
