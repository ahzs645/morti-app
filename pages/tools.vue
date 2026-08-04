<script setup lang="ts">
import {
  PORT_STATUS_LABEL,
  type PortStatus,
  WOODWORKING_TOOLBARS,
  toolStats,
} from '~~/shared/domain/woodworking-tools'

useHead({ title: 'Woodworking tool map · Morti' })

const groups = WOODWORKING_TOOLBARS
const stats = toolStats()

const STATUS_ORDER: PortStatus[] = ['ported', 'native', 'partial', 'not-applicable']

/** Filter chips. `all` is the default so the page reads as a complete map. */
const activeStatus = ref<PortStatus | 'all'>('all')

const statusFilters = computed(() => [
  { value: 'all' as const, label: 'All', count: stats.total },
  ...STATUS_ORDER.map(status => ({
    value: status,
    label: PORT_STATUS_LABEL[status],
    count: stats.byStatus[status],
  })),
])

const visibleGroups = computed(() =>
  groups
    .map(group => ({
      ...group,
      tools: activeStatus.value === 'all'
        ? group.tools
        : group.tools.filter(tool => tool.status === activeStatus.value),
    }))
    .filter(group => group.tools.length > 0),
)

const coveragePercent = computed(() => Math.round(stats.coverage * 100))

/** Palette-consistent badge styling per status. */
const STATUS_CLASS: Record<PortStatus, string> = {
  'ported': 'bg-primary/15 text-primary',
  'native': 'bg-success/15 text-success',
  'partial': 'bg-warning/15 text-warning',
  'not-applicable': 'bg-elevated text-dimmed',
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <header class="mb-8">
      <NuxtLink
        to="/"
        class="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors duration-150 hover:text-highlighted"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-3.5"
        />
        Back to projects
      </NuxtLink>

      <h1 class="text-balance text-2xl font-semibold text-highlighted sm:text-3xl">
        Woodworking tool map
      </h1>
      <p class="mt-2 max-w-2xl text-pretty text-sm text-muted">
        Where each tool from the FreeCAD
        <a
          href="https://github.com/dprojects/Woodworking"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline-offset-2 hover:underline"
        >Woodworking workbench</a>
        lives in Morti. Grouped by the workbench's own toolbars, so you can look
        a tool up by the name you already use.
      </p>

      <dl class="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt class="text-[11px] text-muted">
            Tools mapped
          </dt>
          <dd class="text-lg font-semibold tabular-nums text-highlighted">
            {{ stats.total }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted">
            Toolbars
          </dt>
          <dd class="text-lg font-semibold tabular-nums text-highlighted">
            {{ groups.length }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted">
            Fully covered
          </dt>
          <dd class="text-lg font-semibold tabular-nums text-highlighted">
            {{ coveragePercent }}%
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted">
            Not applicable
          </dt>
          <dd class="text-lg font-semibold tabular-nums text-highlighted">
            {{ stats.byStatus['not-applicable'] }}
          </dd>
        </div>
      </dl>
      <p class="mt-2 text-[11px] text-dimmed">
        “Fully covered” counts ported and already-native tools as a share of the
        tools that make sense in a browser; FreeCAD's own IDE features are excluded,
        and partial ports are counted separately so the number isn't flattering.
      </p>
    </header>

    <div
      class="mb-6 flex flex-wrap gap-1.5"
      role="group"
      aria-label="Filter tools by port status"
    >
      <UButton
        v-for="filter in statusFilters"
        :key="filter.value"
        :label="`${filter.label} (${filter.count})`"
        size="xs"
        color="neutral"
        :variant="activeStatus === filter.value ? 'solid' : 'soft'"
        class="active:scale-[0.97] transition-transform duration-150"
        :aria-pressed="activeStatus === filter.value"
        @click="activeStatus = filter.value"
      />
    </div>

    <section
      v-for="group in visibleGroups"
      :key="group.name"
      class="mb-8"
    >
      <h2 class="mb-2 text-sm font-semibold capitalize text-highlighted">
        {{ group.name }}
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
        <table class="w-full min-w-[40rem] border-collapse text-xs">
          <thead>
            <tr class="bg-muted/60 text-left text-muted">
              <th class="border border-default px-2 py-1.5 font-medium">Tool</th>
              <th class="border border-default px-2 py-1.5 font-medium">Status</th>
              <th class="border border-default px-2 py-1.5 font-medium">In Morti</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tool in group.tools"
              :key="tool.tool"
              class="odd:bg-default even:bg-muted/20"
            >
              <td class="border border-default px-2 py-1.5 align-top font-mono text-[11px] text-highlighted">
                {{ tool.tool }}
              </td>
              <td class="border border-default px-2 py-1.5 align-top">
                <span :class="['inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_CLASS[tool.status]]">
                  {{ PORT_STATUS_LABEL[tool.status] }}
                </span>
              </td>
              <td class="border border-default px-2 py-1.5 align-top text-default">
                <span class="text-highlighted">{{ tool.where }}</span>
                <span
                  v-if="tool.note"
                  class="mt-0.5 block text-[11px] text-muted"
                >{{ tool.note }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
