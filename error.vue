<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)

const eyebrow = computed(() =>
  isNotFound.value ? '404' : `Error ${props.error.statusCode || ''}`.trim(),
)

const heading = computed(() =>
  isNotFound.value ? 'Page not found' : 'Something went wrong',
)

const description = computed(() =>
  isNotFound.value
    ? "The page you're looking for doesn't exist or has been moved."
    : (props.error.message || 'An unexpected error occurred.'),
)

function handleHome() {
  clearError({ redirect: '/' })
}

function handleReload() {
  reloadNuxtApp({ ttl: 0 })
}
</script>

<template>
  <div class="fixed inset-0 flex items-center justify-center p-6">
    <UCard class="w-full max-w-md">
      <div class="text-xs font-medium uppercase tracking-wider text-muted">{{ eyebrow }}</div>
      <h1 class="mt-2 text-xl font-semibold text-highlighted">{{ heading }}</h1>
      <p class="mt-2 text-sm text-muted">{{ description }}</p>
      <div class="mt-6 flex gap-2">
        <UButton color="primary" variant="solid" @click="handleHome">Home</UButton>
        <UButton v-if="!isNotFound" color="neutral" variant="outline" @click="handleReload">Reload</UButton>
      </div>
    </UCard>
  </div>
</template>
