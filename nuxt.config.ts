// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/fonts',
    '@nuxtjs/color-mode',
  ],

  css: ['~/assets/css/main.css'],

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
    storageKey: 'nuxt-color-mode',
  },

  icon: {
    mode: 'css',
    provider: 'server',
    cssLayer: 'base',
  },

  fonts: {
    families: [
      { name: 'Public Sans', provider: 'google', weights: [400, 500, 600, 700], styles: ['normal', 'italic'] },
    ],
  },

  routeRules: {
    '/': { ssr: false },
    '/p/**': { ssr: false },
    '/project/**': { ssr: false },
    '/render/**': { ssr: false },
  },

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    authSecret: process.env.AUTH_SECRET || process.env.NUXT_AUTH_SECRET || '',
    postmarkServerToken: process.env.POSTMARK_SERVER_TOKEN || '',
    postmarkFromEmail: process.env.POSTMARK_FROM_EMAIL || '',
    postmarkMessageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    cloudflareAiApiToken: process.env.CLOUDFLARE_AI_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN || '',
    cloudflareAiModel: process.env.CLOUDFLARE_AI_MODEL || '@cf/openai/gpt-oss-20b',
    aiFurnitureAllowLocalUnauth: process.env.AI_FURNITURE_ALLOW_LOCAL_UNAUTH === 'true',
    localAuthBypass: process.env.LOCAL_AUTH_BYPASS === 'true',
    public: {
      appBaseUrl: process.env.NUXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL || '',
      posthogKey: 'phc_A6uepvw77fYmapESpFBiwr6Utk3WPaKtzpByTehZbpkL',
      posthogHost: 'https://e.morti.app',
      posthogUiHost: 'https://eu.posthog.com',
      posthogDebug: false,
      appName: 'Morti',
      features: {
        projectStyleTab: false,
        promptFurniture: false,
      },
      three: {
        maxTextureDimension: 16384,
        clearColor: 0,
        maxFps: 120,
      },
    },
  },

  vite: {
    optimizeDeps: { include: ['three', 'yjs'] },
  },

  experimental: {
    payloadExtraction: false,
    viteEnvironmentApi: true,
  },

  compatibilityDate: '2025-01-01',
})
