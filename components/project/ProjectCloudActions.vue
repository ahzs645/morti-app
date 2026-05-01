<script setup lang="ts">
import type { CloudProjectRecord, LocalProjectRow, PublicStyle } from '~~/shared/domain/types'

interface Props {
  project: LocalProjectRow
  cloudRecord?: CloudProjectRecord | null
  publicStyle?: PublicStyle | null
  draftSyncStatus?: 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  cloudRecord: null,
  publicStyle: null,
  draftSyncStatus: 'idle',
})

const emit = defineEmits<{
  (e: 'retryDraftSync'): void
  (e: 'published', record: CloudProjectRecord): void
  (e: 'unpublished'): void
}>()

const { user, isVerified } = useAuth()
const open = ref(false)
const showActions = computed(() => !!user.value?.id && isVerified.value)
const isPublished = computed(() =>
  !!props.cloudRecord?.id
  && props.cloudRecord.visibility === 'public'
  && typeof props.cloudRecord.snapshot === 'string'
  && props.cloudRecord.snapshot.length > 0,
)

function onPublished(record: CloudProjectRecord) {
  emit('published', record)
}

function onUnpublished() {
  emit('unpublished')
}
</script>

<template>
  <div
    v-if="showActions"
    class="flex max-w-full flex-col items-end gap-1"
  >
    <div class="flex max-w-full flex-row flex-wrap items-center justify-end gap-2">
      <div
        v-if="props.draftSyncStatus === 'error'"
        class="flex flex-wrap items-center justify-end gap-0.5 rounded-full border border-default bg-muted p-1 shadow-sm backdrop-blur"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="Retry"
          class="h-8 shrink-0 rounded-full px-2.5"
          @click="emit('retryDraftSync')"
        />
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="solid"
        icon="i-lucide-square-arrow-up"
        :label="isPublished ? 'Published' : 'Publish'"
        class="h-8 min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold shadow-sm"
        @click="open = true"
      />
    </div>

    <ProjectPublishDialog
      v-model:open="open"
      :project="props.project"
      :published-cloud-record="props.cloudRecord"
      :public-style="props.publicStyle"
      @published="onPublished"
      @unpublished="onUnpublished"
    />
  </div>
</template>
