<script setup lang="ts">
interface Props {
  title?: string
  description?: string
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { required: true })

const slots = useSlots()

const ui = {
  content: '!max-w-sm',
  footer: 'flex flex-col gap-0 p-4 sm:px-5',
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
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
