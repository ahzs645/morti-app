<script setup lang="ts">
interface Props {
  title?: string
  message?: string
  cancelLabel?: string
  confirmLabel?: string
  confirmColor?: 'primary' | 'error' | 'neutral'
}

const props = withDefaults(defineProps<Props>(), {
  message: '',
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  confirmColor: 'error',
})
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm'): void
}>()

function cancel() {
  emit('cancel')
  open.value = false
}

function confirm() {
  emit('confirm')
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="props.title"
  >
    <slot v-if="$slots.default" />
    <p
      v-else-if="props.message"
      class="text-pretty text-sm leading-relaxed text-muted"
    >
      {{ props.message }}
    </p>

    <template #footer>
      <div class="grid w-full grid-cols-2 gap-2">
        <UButton
          :label="props.cancelLabel"
          color="neutral"
          variant="outline"
          class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          @click="cancel"
        />
        <UButton
          :label="props.confirmLabel"
          :color="props.confirmColor"
          class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          @click="confirm"
        />
      </div>
    </template>
  </AppDialog>
</template>
