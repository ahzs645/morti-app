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

const { isCloudAuthed } = useAuth()
const LazyProjectPublishDialog = defineAsyncComponent(() => import('~/components/project/ProjectPublishDialog.vue'))
const open = ref(false)
const showActions = computed(() => isCloudAuthed.value)
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
        class="flex flex-wrap items-center justify-end gap-0.5 rounded-full bg-muted p-1 shadow-md ring-1 ring-default/60 backdrop-blur"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="Retry"
          class="h-10 min-h-10 shrink-0 rounded-full px-3 transition-transform active:scale-[0.97]"
          @click="emit('retryDraftSync')"
        />
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="solid"
        icon="i-lucide-square-arrow-up"
        :label="isPublished ? 'Published' : 'Publish'"
        class="h-10 min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold shadow-md transition-transform active:scale-[0.97]"
        @click="open = true"
      />
    </div>

    <LazyProjectPublishDialog
      v-if="open"
      v-model:open="open"
      :project="props.project"
      :published-cloud-record="props.cloudRecord"
      :public-style="props.publicStyle"
      @published="onPublished"
      @unpublished="onUnpublished"
    />
  </div>
</template>
