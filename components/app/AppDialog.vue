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
  content: `!max-w-[calc(100vw-1rem)] ${contentSizeClass.value} rounded-2xl shadow-2xl`,
  header: 'p-4 sm:p-5',
  body: 'p-4 sm:p-5',
  footer: 'flex flex-col gap-0 p-4 sm:px-5',
  title: 'text-balance',
  description: 'text-pretty',
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
