<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  cancelLabel?: string
  primaryLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  cancelLabel: 'Cancel',
  primaryLabel: 'Save',
})
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'primary'): void
}>()

function cancel() {
  emit('cancel')
  open.value = false
}

function primary() {
  emit('primary')
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="props.title"
    :description="props.description"
  >
    <slot />

    <template #footer="{ close }">
      <slot
        name="footer"
        :close="close"
      >
        <div class="grid w-full grid-cols-2 gap-2">
          <UButton
            :label="props.cancelLabel"
            color="neutral"
            variant="outline"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            @click="cancel"
          />
          <UButton
            :label="props.primaryLabel"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            @click="primary"
          />
        </div>
      </slot>
    </template>
  </AppDialog>
</template>
