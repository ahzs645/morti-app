<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})

useSeoMeta({
  title: 'Madera',
  description: 'Design furniture locally with collaborative-ready Yjs projects.',
  ogTitle: 'Madera',
  ogDescription: 'Design furniture locally with collaborative-ready Yjs projects.',
  twitterCard: 'summary',
})
</script>

<template>
  <UApp>
    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>
  </UApp>
</template>
