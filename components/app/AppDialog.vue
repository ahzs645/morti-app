<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  dismissible: true,
  size: 'sm',
})
const open = defineModel<boolean>('open', { required: true })

const slots = useSlots()

const contentSizeClass = computed(() => {
  if (props.size === 'lg') return 'sm:!max-w-xl'
  if (props.size === 'md') return 'sm:!max-w-md'
  return 'sm:!max-w-sm'
})

const ui = computed(() => ({
  overlay: 'bg-[color-mix(in_oklch,var(--color-morti-1000)_65%,transparent)] backdrop-blur-[2px]',
  content: [
    '!max-w-[calc(100vw-1rem)]',
    contentSizeClass.value,
    'rounded-2xl ring-1 ring-default/40',
    'shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55),0_8px_24px_-8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)]',
  ].join(' '),
  header: 'p-4 sm:p-5',
  body: 'p-4 sm:p-5',
  footer: 'flex flex-col gap-0 p-4 sm:px-5',
  title: 'text-balance text-lg sm:text-xl font-semibold tracking-[-0.01em] text-highlighted',
  description: 'text-pretty text-sm leading-relaxed text-muted mt-1',
}))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
    :dismissible="props.dismissible"
    :ui="ui"
  >
    <template #body>
      <div class="flex w-full min-w-0 flex-col gap-4">
        <slot name="prependBody" />
        <slot />
      </div>
    </template>

    <template
      v-if="slots.footer"
      #footer="{ close }"
    >
      <slot
        name="footer"
        :close="close"
      />
    </template>
  </UModal>
</template>
