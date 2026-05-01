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
  <div class="fixed inset-0 flex items-center justify-center bg-default p-4 sm:p-6">
    <UCard class="w-full max-w-md shadow-md">
      <div class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted tabular-nums">
        {{ eyebrow }}
      </div>
      <h1 class="mt-2 text-xl font-semibold text-highlighted text-balance sm:text-2xl">
        {{ heading }}
      </h1>
      <p class="mt-2 text-sm text-muted text-pretty">
        {{ description }}
      </p>
      <div class="mt-6 flex flex-wrap gap-2">
        <UButton
          color="primary"
          variant="solid"
          class="min-h-10 transition-transform duration-150 ease-out active:scale-[0.97]"
          @click="handleHome"
        >
          Home
        </UButton>
        <UButton
          v-if="!isNotFound"
          color="neutral"
          variant="outline"
          class="min-h-10 transition-transform duration-150 ease-out active:scale-[0.97]"
          @click="handleReload"
        >
          Reload
        </UButton>
      </div>
    </UCard>
  </div>
</template>
