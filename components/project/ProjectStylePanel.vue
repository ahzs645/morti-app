<script setup lang="ts">
import type { PublicStyle, RenderStyle } from '~~/shared/domain/types'
import { DEFAULT_PUBLIC_STYLE, normalizePublicStyle } from '~~/shared/domain/defaults'

const model = defineModel<PublicStyle>({ required: true })

const style = computed(() => normalizePublicStyle(model.value))
const technicalRows = computed(() => {
  const colors = style.value.technical.colors
  return [
    { key: 'background', label: 'Background', value: colors.background },
    { key: 'grid', label: 'Grid', value: colors.grid },
    { key: 'outlines', label: 'Outlines', value: colors.outlines },
    { key: 'fills', label: 'Fills', value: colors.fills },
  ]
})
const renderedRows = computed(() => {
  const colors = style.value.rendered.colors
  return [
    { key: 'background', label: 'Background', value: colors.background },
    { key: 'grid', label: 'Grid', value: colors.grid },
    { key: 'defaultPanel', label: 'Default panel', value: colors.defaultPanel },
    { key: 'verticalSide', label: 'Vertical side', value: colors.verticalSide },
    { key: 'horizontalDeck', label: 'Horizontal deck', value: colors.horizontalDeck },
    { key: 'moduleFront', label: 'Module front', value: colors.moduleFront },
  ]
})
const activeRows = computed(() => style.value.renderStyle === 'technical' ? technicalRows.value : renderedRows.value)

function setRenderStyle(renderStyle: RenderStyle) {
  model.value = normalizePublicStyle({ ...style.value, renderStyle })
}

function setColor(key: string, value: string) {
  const current = style.value
  if (current.renderStyle === 'technical') {
    model.value = normalizePublicStyle({
      ...current,
      technical: {
        colors: {
          ...current.technical.colors,
          [key]: value,
        },
      },
    })
    return
  }
  model.value = normalizePublicStyle({
    ...current,
    rendered: {
      colors: {
        ...current.rendered.colors,
        [key]: value,
      },
    },
  })
}

function onColorInput(key: string, event: Event) {
  setColor(key, (event.target as HTMLInputElement | null)?.value ?? '')
}

function resetActiveStyle() {
  const current = style.value
  if (current.renderStyle === 'technical') {
    model.value = normalizePublicStyle({ ...current, technical: DEFAULT_PUBLIC_STYLE.technical })
    return
  }
  model.value = normalizePublicStyle({ ...current, rendered: DEFAULT_PUBLIC_STYLE.rendered })
}
</script>

<template>
  <div class="pointer-events-auto w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-muted/95 p-3 shadow-xl ring-1 ring-default/60 backdrop-blur">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Public style
        </p>
        <p class="text-balance text-sm font-semibold text-highlighted">
          Canvas rendering
        </p>
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        label="Reset"
        class="min-h-10 rounded-full transition-transform active:scale-[0.97]"
        @click="resetActiveStyle"
      />
    </div>

    <div
      class="mb-3 flex rounded-full bg-default p-1 shadow-sm ring-1 ring-default/60"
      role="group"
      aria-label="Rendering style"
    >
      <UButton
        size="xs"
        color="neutral"
        label="Technical"
        class="h-10 min-h-10 flex-1 rounded-full transition-transform active:scale-[0.97]"
        :variant="style.renderStyle === 'technical' ? 'solid' : 'ghost'"
        @click="setRenderStyle('technical')"
      />
      <UButton
        size="xs"
        color="neutral"
        label="Rendered"
        class="h-10 min-h-10 flex-1 rounded-full transition-transform active:scale-[0.97]"
        :variant="style.renderStyle === 'rendered' ? 'solid' : 'ghost'"
        @click="setRenderStyle('rendered')"
      />
    </div>

    <div class="space-y-2">
      <label
        v-for="row in activeRows"
        :key="row.key"
        class="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-default px-2.5 py-2 shadow-sm ring-1 ring-default/60"
      >
        <span class="min-w-0 truncate text-xs font-medium text-toned">{{ row.label }}</span>
        <span class="flex shrink-0 items-center gap-2">
          <span class="font-mono text-[11px] tabular-nums text-muted">{{ row.value }}</span>
          <input
            type="color"
            class="size-7 cursor-pointer rounded-md border border-default bg-transparent p-0"
            :value="row.value"
            :aria-label="row.label"
            @input="onColorInput(row.key, $event)"
          >
        </span>
      </label>
    </div>
  </div>
</template>
