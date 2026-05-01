export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'stone',
      success: 'madera',
    },
    modal: {
      variants: {
        transition: {
          true: {
            overlay: 'data-[state=open]:animate-[fade-in_120ms_ease-out] data-[state=closed]:animate-[fade-out_120ms_ease-in]',
            content: 'data-[state=open]:animate-[scale-in_120ms_ease-out] data-[state=closed]:animate-[scale-out_120ms_ease-in]',
          },
        },
      },
    },
    icons: {
      loading: 'i-lucide-loader-circle',
      arrowLeft: 'i-lucide-arrow-left',
      arrowRight: 'i-lucide-arrow-right',
      check: 'i-lucide-check',
      close: 'i-lucide-x',
      chevronDown: 'i-lucide-chevron-down',
      chevronUp: 'i-lucide-chevron-up',
      chevronLeft: 'i-lucide-chevron-left',
      chevronRight: 'i-lucide-chevron-right',
      external: 'i-lucide-arrow-up-right',
      menu: 'i-lucide-menu',
      info: 'i-lucide-info',
      warning: 'i-lucide-triangle-alert',
      error: 'i-lucide-circle-alert',
      success: 'i-lucide-circle-check',
    },
    toaster: {
      defaultVariants: { position: 'bottom-right' },
    },
  },
})
