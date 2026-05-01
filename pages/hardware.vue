<script setup lang="ts">
import type { HardwareSpec } from '~~/shared/domain/types'
import { HARDWARE_CATALOG } from '~~/shared/domain/hardware-catalog'

const HardwareDrawingCanvas = defineAsyncComponent(() => import('~~/components/three/HardwareDrawingCanvas.vue'))

const sortedHardware = computed(() => [...HARDWARE_CATALOG].sort((a, b) => a.code.localeCompare(b.code)))

function formatDims(spec: HardwareSpec): string {
  const parts: string[] = []
  if (spec.diameterMm != null) parts.push(`Ø${spec.diameterMm} mm`)
  if (spec.lengthMm != null) parts.push(`L ${spec.lengthMm} mm`)
  if (spec.widthMm != null) parts.push(`W ${spec.widthMm} mm`)
  if (spec.heightMm != null) parts.push(`H ${spec.heightMm} mm`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="w-full max-w-6xl">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-primary">
            Builder system
          </p>
          <h1 class="mt-1 text-2xl font-semibold text-highlighted sm:text-3xl">
            Hardware catalog
          </h1>
          <p class="mt-2 max-w-2xl text-sm text-muted">
            Reference hardware copied from the source furniture system. These items
            stay hidden during design and are used to produce hardware lists and
            future machining operations.
          </p>
        </div>
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          label="Projects"
          color="neutral"
          variant="outline"
        />
      </div>

      <div class="overflow-hidden rounded-lg ring ring-default">
        <table class="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr class="bg-muted/60 text-left text-muted">
              <th class="border border-default px-3 py-2 font-medium">Code</th>
              <th class="border border-default px-3 py-2 font-medium">Drawing</th>
              <th class="border border-default px-3 py-2 font-medium">Name</th>
              <th class="border border-default px-3 py-2 font-medium">Kind</th>
              <th class="border border-default px-3 py-2 font-medium">Dimensions</th>
              <th class="border border-default px-3 py-2 font-medium">Included?</th>
              <th class="border border-default px-3 py-2 font-medium">Notes</th>
              <th class="border border-default px-3 py-2 font-medium">Technical</th>
              <th class="border border-default px-3 py-2 font-medium">Buy</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in sortedHardware"
              :key="item.code"
              class="odd:bg-default even:bg-muted/20"
            >
              <td class="border border-default px-3 py-2 font-semibold text-highlighted">{{ item.code }}</td>
              <td class="border border-default px-3 py-2">
                <HardwareDrawingCanvas :spec="item" />
              </td>
              <td class="border border-default px-3 py-2 text-highlighted">{{ item.name }}</td>
              <td class="border border-default px-3 py-2 text-muted">{{ item.kind }}</td>
              <td class="border border-default px-3 py-2 text-highlighted">{{ formatDims(item) }}</td>
              <td class="border border-default px-3 py-2">
                <UBadge
                  :color="item.included ? 'primary' : 'neutral'"
                  :label="item.included ? 'included' : 'excluded'"
                  variant="soft"
                />
              </td>
              <td class="border border-default px-3 py-2 text-muted">{{ item.notes ?? '—' }}</td>
              <td class="border border-default px-3 py-2">
                <div v-if="item.links?.length" class="flex flex-wrap gap-1.5">
                  <a
                    v-for="link in item.links"
                    :key="link.url"
                    :href="link.url"
                    :title="link.label"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-full bg-muted px-2 py-1 text-xs font-medium text-highlighted ring ring-default transition hover:bg-elevated"
                  >{{ link.label }}</a>
                </div>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="border border-default px-3 py-2">
                <div v-if="item.buyLinks?.length" class="flex flex-wrap gap-1.5">
                  <a
                    v-for="(link, i) in item.buyLinks"
                    :key="link.url"
                    :href="link.url"
                    :aria-label="`Buy ${item.name} from ${link.label}`"
                    :title="link.label"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex size-6 items-center justify-center rounded-full bg-neutral-500 text-xs font-semibold text-[var(--ui-bg)] transition hover:bg-neutral-600"
                  >{{ i + 1 }}</a>
                </div>
                <span v-else class="text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </UContainer>
</template>
