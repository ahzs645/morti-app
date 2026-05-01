export default defineAppConfig({
  ui: {
    colors: {
      primary: 'morti',
      neutral: 'morti',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue',
    },
    modal: {
      variants: {
        transition: {
          true: {
            overlay: 'data-[state=open]:animate-[morti-fade-in_140ms_ease-out] data-[state=closed]:animate-[morti-fade-in_120ms_ease-in_reverse]',
            content: 'data-[state=open]:animate-[morti-rise-in_180ms_cubic-bezier(0.2,0,0,1)] data-[state=closed]:animate-[morti-rise-out_140ms_cubic-bezier(0.2,0,0,1)]',
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
