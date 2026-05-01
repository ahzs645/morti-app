<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  dismissible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  dismissible: true,
})
const open = defineModel<boolean>('open', { required: true })

const slots = useSlots()

const ui = {
  content: '!max-w-[calc(100vw-1rem)] sm:!max-w-sm rounded-2xl shadow-2xl',
  header: 'p-4 sm:p-5',
  body: 'p-4 sm:p-5',
  footer: 'flex flex-col gap-0 p-4 sm:px-5',
  title: 'text-balance',
  description: 'text-pretty',
}
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
