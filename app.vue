<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})

useSeoMeta({
  title: 'Morti',
  description: 'Design furniture with cloud sync, publishing, and shareable Yjs projects.',
  ogTitle: 'Morti',
  ogDescription: 'Design furniture with cloud sync, publishing, and shareable Yjs projects.',
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
