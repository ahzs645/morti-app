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
  <UContainer class="py-8 sm:py-14">
    <div class="w-full max-w-6xl">
      <div class="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div>
          <p class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted">
            Builder system
          </p>
          <h1 class="mt-1 text-2xl font-semibold text-balance text-highlighted sm:text-3xl">
            Hardware catalog
          </h1>
          <p class="mt-2 max-w-2xl text-pretty text-sm text-muted">
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
          class="active:scale-[0.97] transition-transform"
        />
      </div>

      <div class="max-w-full overflow-x-auto rounded-xl shadow-sm ring ring-default">
        <table class="w-full min-w-[48rem] border-collapse text-sm tabular-nums">
          <thead>
            <tr class="bg-muted text-left text-muted">
              <th class="border-b border-default px-3 py-2 font-medium">Code</th>
              <th class="border-b border-default px-3 py-2 font-medium">Drawing</th>
              <th class="border-b border-default px-3 py-2 font-medium">Name</th>
              <th class="border-b border-default px-3 py-2 font-medium">Kind</th>
              <th class="border-b border-default px-3 py-2 font-medium">Dimensions</th>
              <th class="border-b border-default px-3 py-2 font-medium">Included?</th>
              <th class="border-b border-default px-3 py-2 font-medium">Notes</th>
              <th class="border-b border-default px-3 py-2 font-medium">Technical</th>
              <th class="border-b border-default px-3 py-2 font-medium">Buy</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in sortedHardware"
              :key="item.code"
              class="odd:bg-default even:bg-muted/40"
            >
              <td class="border-b border-default px-3 py-2 font-semibold text-highlighted">{{ item.code }}</td>
              <td class="border-b border-default px-3 py-2">
                <!-- Only bundled assets get a canvas; the rest would request a
                     file that is not there, get the SPA fallback back, and
                     fail in the loader with nothing shown to the reader. -->
                <HardwareDrawingCanvas
                  v-if="item.modelBundled"
                  :spec="item"
                />
                <div
                  v-else
                  class="flex size-28 flex-col items-center justify-center gap-1 rounded-md bg-muted/40 px-2 text-center shadow-sm ring-1 ring-default/60"
                  :aria-label="`${item.code} ${item.name}: no 3D model bundled`"
                >
                  <UIcon
                    name="i-lucide-box"
                    class="size-5 text-dimmed"
                  />
                  <span class="text-[10px] leading-tight text-dimmed">No model bundled</span>
                </div>
              </td>
              <td class="border-b border-default px-3 py-2 text-highlighted">{{ item.name }}</td>
              <td class="border-b border-default px-3 py-2 text-muted">{{ item.kind }}</td>
              <td class="border-b border-default px-3 py-2 text-highlighted">{{ formatDims(item) }}</td>
              <td class="border-b border-default px-3 py-2">
                <UBadge
                  :color="item.included ? 'primary' : 'neutral'"
                  :label="item.included ? 'included' : 'excluded'"
                  variant="soft"
                />
              </td>
              <td class="border-b border-default px-3 py-2 text-muted">{{ item.notes ?? '—' }}</td>
              <td class="border-b border-default px-3 py-2">
                <div v-if="item.links?.length" class="flex flex-wrap gap-1.5">
                  <a
                    v-for="link in item.links"
                    :key="link.url"
                    :href="link.url"
                    :title="link.label"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-full bg-muted px-2 py-1 text-xs font-medium text-highlighted shadow-sm transition-[background-color,transform] hover:bg-elevated active:scale-[0.97]"
                  >{{ link.label }}</a>
                </div>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="border-b border-default px-3 py-2">
                <div v-if="item.buyLinks?.length" class="flex flex-wrap gap-1.5">
                  <a
                    v-for="(link, i) in item.buyLinks"
                    :key="link.url"
                    :href="link.url"
                    :aria-label="`Buy ${item.name} from ${link.label}`"
                    :title="link.label"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex size-7 items-center justify-center rounded-full bg-elevated text-xs font-semibold tabular-nums text-highlighted shadow-sm transition-[background-color,transform] hover:bg-accented active:scale-[0.97]"
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
