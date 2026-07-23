<script setup lang="ts">
const publicAsset = usePublicAsset()
useHead({
  htmlAttrs: { lang: 'en' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: publicAsset('/favicon.svg') },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: publicAsset('/favicon-32x32.png') },
    { rel: 'apple-touch-icon', sizes: '180x180', href: publicAsset('/apple-touch-icon.png') },
  ],
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
