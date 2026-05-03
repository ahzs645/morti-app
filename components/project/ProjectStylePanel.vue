<script setup lang="ts">
import type { MaterialAssignment, PublicStyle, RenderStyle } from '~~/shared/domain/types'
import { DEFAULT_PUBLIC_STYLE, normalizeHexColor, normalizePublicStyle } from '~~/shared/domain/defaults'
import { CABINET_PARTS, type CabinetPart } from '~~/shared/domain/materials'

interface Props {
  surface?: 'floating' | 'pane' | 'sidebar'
}

const props = withDefaults(defineProps<Props>(), {
  surface: 'floating',
})

type MobileStyleTab = 'mode' | 'parts' | 'scene'

const model = defineModel<PublicStyle>({ required: true })

const activeMobileTab = ref<MobileStyleTab>('parts')
const style = computed(() => normalizePublicStyle(model.value))
const panelClass = computed(() =>
  props.surface === 'pane'
    ? 'pointer-events-auto h-full min-h-0 w-full overflow-y-auto overscroll-contain bg-muted p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]'
    : 'pointer-events-auto w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-muted/95 p-3 shadow-xl ring-1 ring-default/60 backdrop-blur',
)
const technicalRows = computed(() => {
  const colors = style.value.technical.colors
  return [
    { key: 'background', label: 'Background', value: colors.background },
    { key: 'grid', label: 'Grid', value: colors.grid },
    { key: 'outlines', label: 'Outlines', value: colors.outlines },
    { key: 'fills', label: 'Fills', value: colors.fills },
  ]
})
const renderedBackgroundRows = computed(() => {
  const colors = style.value.rendered.colors
  return [
    { key: 'background', label: 'Background', value: colors.background },
    { key: 'grid', label: 'Grid', value: colors.grid },
  ]
})
const isTechnical = computed(() => style.value.renderStyle === 'technical')
const technicalLineRows = computed(() => technicalRows.value.filter(row => row.key === 'outlines' || row.key === 'fills'))
const technicalSceneRows = computed(() => technicalRows.value.filter(row => row.key === 'background' || row.key === 'grid'))
const mobileTabs = computed<{ value: MobileStyleTab, label: string }[]>(() => [
  { value: 'parts', label: isTechnical.value ? 'Lines' : 'Parts' },
  { value: 'mode', label: 'Mode' },
  { value: 'scene', label: 'Scene' },
])

function setRenderStyle(renderStyle: RenderStyle) {
  model.value = normalizePublicStyle({ ...style.value, renderStyle })
}

function setTechnicalColor(key: string, value: string) {
  const current = style.value
  model.value = normalizePublicStyle({
    ...current,
    technical: {
      colors: {
        ...current.technical.colors,
        [key]: value,
      },
    },
  })
}

function setRenderedBackgroundColor(key: string, value: string) {
  const current = style.value
  model.value = normalizePublicStyle({
    ...current,
    rendered: {
      ...current.rendered,
      colors: {
        ...current.rendered.colors,
        [key]: value,
      },
    },
  })
}

function setColor(key: string, value: string) {
  if (isTechnical.value) setTechnicalColor(key, value)
  else setRenderedBackgroundColor(key, value)
}

function onColorInput(key: string, event: Event) {
  setColor(key, (event.target as HTMLInputElement | null)?.value ?? '')
}

function onColorTextCommit(key: string, currentValue: string, event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const next = normalizeHexColor(input.value, currentValue)
  input.value = next.toUpperCase()
  setColor(key, next)
}

function setMaterialPreset(part: CabinetPart, presetId: string) {
  const current = style.value
  const existing = current.rendered.materials[part]
  const next: MaterialAssignment = { ...existing, presetId }
  model.value = normalizePublicStyle({
    ...current,
    rendered: {
      ...current.rendered,
      materials: {
        ...current.rendered.materials,
        [part]: next,
      },
    },
  })
}

function setMaterialCustom(part: CabinetPart, customColor: string) {
  const current = style.value
  const existing = current.rendered.materials[part]
  const next: MaterialAssignment = { ...existing, customColor }
  model.value = normalizePublicStyle({
    ...current,
    rendered: {
      ...current.rendered,
      materials: {
        ...current.rendered.materials,
        [part]: next,
      },
    },
  })
}

function resetActiveStyle() {
  const current = style.value
  if (isTechnical.value) {
    model.value = normalizePublicStyle({ ...current, technical: DEFAULT_PUBLIC_STYLE.technical })
    return
  }
  model.value = normalizePublicStyle({ ...current, rendered: DEFAULT_PUBLIC_STYLE.rendered })
}
</script>

<template>
  <div
    v-if="surface === 'pane'"
    class="style-mobile-controls pointer-events-auto h-full min-h-0 w-full"
    aria-label="Public style controls"
  >
    <div class="style-mobile-card">
      <div
        class="style-mobile-tabs"
        role="tablist"
        aria-label="Style settings"
      >
        <button
          v-for="tab in mobileTabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="style-mobile-tab"
          :aria-selected="activeMobileTab === tab.value"
          :data-active="activeMobileTab === tab.value ? '' : undefined"
          @click="activeMobileTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        class="style-mobile-scroll"
        tabindex="0"
      >
        <div class="style-mobile-content">
          <section
            v-if="activeMobileTab === 'mode'"
            class="style-mobile-section style-section-mode"
          >
            <div class="style-section-title-row">
              <h3 class="style-section-heading">
                Mode
              </h3>
              <div class="style-section-divider" />
            </div>

            <div class="style-section-controls">
              <div class="style-control-row">
                <span class="style-row-label">Style</span>
                <span class="style-pill-group" role="group" aria-label="Rendering style">
                  <button
                    type="button"
                    class="style-select-pill"
                    :data-active="isTechnical ? '' : undefined"
                    @click="setRenderStyle('technical')"
                  >
                    Technical
                  </button>
                  <button
                    type="button"
                    class="style-select-pill"
                    :data-active="!isTechnical ? '' : undefined"
                    @click="setRenderStyle('rendered')"
                  >
                    Rendered
                  </button>
                </span>
              </div>
            </div>
          </section>

          <section
            v-else-if="activeMobileTab === 'parts'"
            class="style-mobile-section style-section-parts"
          >
            <div class="style-section-title-row">
              <h3 class="style-section-heading">
                {{ isTechnical ? 'Lines' : 'Parts' }}
              </h3>
              <div class="style-section-divider" />
            </div>

            <div
              v-if="isTechnical"
              class="style-section-controls"
            >
              <label
                v-for="row in technicalLineRows"
                :key="row.key"
                class="style-control-row style-color-row"
              >
                <span class="style-row-label">{{ row.label }}</span>
                <span class="style-color-controls">
                  <input
                    :value="row.value.toUpperCase()"
                    type="text"
                    inputmode="text"
                    class="style-hex-input"
                    :aria-label="`${row.label} hex color`"
                    @keydown.enter.prevent="onColorTextCommit(row.key, row.value, $event)"
                    @blur="onColorTextCommit(row.key, row.value, $event)"
                  >
                  <span class="style-swatch" :style="{ backgroundColor: row.value }">
                    <input
                      type="color"
                      :value="row.value"
                      :aria-label="row.label"
                      @input="onColorInput(row.key, $event)"
                    >
                  </span>
                </span>
              </label>
            </div>

            <div
              v-else
              class="style-section-controls"
            >
              <ProjectMaterialPicker
                v-for="part in CABINET_PARTS"
                :key="part.key"
                :label="part.label"
                :hint="part.hint"
                :model-value="style.rendered.materials[part.key].presetId"
                :custom-color="style.rendered.materials[part.key].customColor"
                variant="row"
                @update:model-value="setMaterialPreset(part.key, $event)"
                @update:custom-color="setMaterialCustom(part.key, $event)"
              />
            </div>
          </section>

          <section
            v-else
            class="style-mobile-section style-section-scene"
          >
            <div class="style-section-title-row">
              <h3 class="style-section-heading">
                Scene
              </h3>
              <div class="style-section-divider" />
            </div>

            <div class="style-section-controls">
              <label
                v-for="row in isTechnical ? technicalSceneRows : renderedBackgroundRows"
                :key="row.key"
                class="style-control-row style-color-row"
              >
                <span class="style-row-label">{{ row.label }}</span>
                <span class="style-color-controls">
                  <input
                    :value="row.value.toUpperCase()"
                    type="text"
                    inputmode="text"
                    class="style-hex-input"
                    :aria-label="`${row.label} hex color`"
                    @keydown.enter.prevent="onColorTextCommit(row.key, row.value, $event)"
                    @blur="onColorTextCommit(row.key, row.value, $event)"
                  >
                  <span class="style-swatch" :style="{ backgroundColor: row.value }">
                    <input
                      type="color"
                      :value="row.value"
                      :aria-label="row.label"
                      @input="onColorInput(row.key, $event)"
                    >
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>
      </div>

      <div class="style-mobile-save-bar">
        <button
          type="button"
          class="style-reset-button"
          @click="resetActiveStyle"
        >
          Reset style
        </button>
      </div>
    </div>
  </div>

  <aside
    v-else-if="surface === 'sidebar'"
    class="style-sidebar-controls pointer-events-auto h-full min-h-0 w-full"
    aria-label="Public style controls"
  >
    <div class="style-sidebar-shell">
      <div class="style-sidebar-inner">
        <div class="style-sidebar-scroll" tabindex="0">
          <div class="style-sidebar-content">
            <section class="style-mobile-section style-section-mode">
              <div class="style-section-title-row">
                <h3 class="style-section-heading">
                  Mode
                </h3>
                <div class="style-section-divider" />
              </div>

              <div class="style-section-controls">
                <div class="style-control-row">
                  <span class="style-row-label">Style</span>
                  <span class="style-pill-group" role="group" aria-label="Rendering style">
                    <button
                      type="button"
                      class="style-select-pill"
                      :data-active="isTechnical ? '' : undefined"
                      @click="setRenderStyle('technical')"
                    >
                      Technical
                    </button>
                    <button
                      type="button"
                      class="style-select-pill"
                      :data-active="!isTechnical ? '' : undefined"
                      @click="setRenderStyle('rendered')"
                    >
                      Rendered
                    </button>
                  </span>
                </div>
              </div>
            </section>

            <section class="style-mobile-section style-section-parts">
              <div class="style-section-title-row">
                <h3 class="style-section-heading">
                  {{ isTechnical ? 'Lines' : 'Parts' }}
                </h3>
                <div class="style-section-divider" />
              </div>

              <div
                v-if="isTechnical"
                class="style-section-controls"
              >
                <label
                  v-for="row in technicalLineRows"
                  :key="row.key"
                  class="style-control-row style-color-row"
                >
                  <span class="style-row-label">{{ row.label }}</span>
                  <span class="style-color-controls">
                    <input
                      :value="row.value.toUpperCase()"
                      type="text"
                      inputmode="text"
                      class="style-hex-input"
                      :aria-label="`${row.label} hex color`"
                      @keydown.enter.prevent="onColorTextCommit(row.key, row.value, $event)"
                      @blur="onColorTextCommit(row.key, row.value, $event)"
                    >
                    <span class="style-swatch" :style="{ backgroundColor: row.value }">
                      <input
                        type="color"
                        :value="row.value"
                        :aria-label="row.label"
                        @input="onColorInput(row.key, $event)"
                      >
                    </span>
                  </span>
                </label>
              </div>

              <div
                v-else
                class="style-section-controls"
              >
                <ProjectMaterialPicker
                  v-for="part in CABINET_PARTS"
                  :key="part.key"
                  :label="part.label"
                  :hint="part.hint"
                  :model-value="style.rendered.materials[part.key].presetId"
                  :custom-color="style.rendered.materials[part.key].customColor"
                  variant="row"
                  @update:model-value="setMaterialPreset(part.key, $event)"
                  @update:custom-color="setMaterialCustom(part.key, $event)"
                />
              </div>
            </section>

            <section class="style-mobile-section style-section-scene">
              <div class="style-section-title-row">
                <h3 class="style-section-heading">
                  Scene
                </h3>
                <div class="style-section-divider" />
              </div>

              <div class="style-section-controls">
                <label
                  v-for="row in isTechnical ? technicalSceneRows : renderedBackgroundRows"
                  :key="row.key"
                  class="style-control-row style-color-row"
                >
                  <span class="style-row-label">{{ row.label }}</span>
                  <span class="style-color-controls">
                    <input
                      :value="row.value.toUpperCase()"
                      type="text"
                      inputmode="text"
                      class="style-hex-input"
                      :aria-label="`${row.label} hex color`"
                      @keydown.enter.prevent="onColorTextCommit(row.key, row.value, $event)"
                      @blur="onColorTextCommit(row.key, row.value, $event)"
                    >
                    <span class="style-swatch" :style="{ backgroundColor: row.value }">
                      <input
                        type="color"
                        :value="row.value"
                        :aria-label="row.label"
                        @input="onColorInput(row.key, $event)"
                      >
                    </span>
                  </span>
                </label>
              </div>
            </section>
          </div>
        </div>

        <div class="style-mobile-save-bar style-sidebar-save-bar">
          <button
            type="button"
            class="style-reset-button"
            @click="resetActiveStyle"
          >
            Reset style
          </button>
        </div>
      </div>
    </div>
  </aside>

  <div v-else :class="panelClass">
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
        :variant="isTechnical ? 'solid' : 'ghost'"
        @click="setRenderStyle('technical')"
      />
      <UButton
        size="xs"
        color="neutral"
        label="Rendered"
        class="h-10 min-h-10 flex-1 rounded-full transition-transform active:scale-[0.97]"
        :variant="isTechnical ? 'ghost' : 'solid'"
        @click="setRenderStyle('rendered')"
      />
    </div>

    <template v-if="isTechnical">
      <div class="space-y-2">
        <label
          v-for="row in technicalRows"
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
    </template>

    <template v-else>
      <p class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        Materials
      </p>
      <div class="space-y-1.5">
        <ProjectMaterialPicker
          v-for="part in CABINET_PARTS"
          :key="part.key"
          :label="part.label"
          :hint="part.hint"
          :model-value="style.rendered.materials[part.key].presetId"
          :custom-color="style.rendered.materials[part.key].customColor"
          @update:model-value="setMaterialPreset(part.key, $event)"
          @update:custom-color="setMaterialCustom(part.key, $event)"
        />
      </div>

      <p class="mt-3 mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        Scene
      </p>
      <div class="space-y-2">
        <label
          v-for="row in renderedBackgroundRows"
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
    </template>
  </div>
</template>

<style scoped>
.style-mobile-controls,
.style-sidebar-controls {
  -webkit-tap-highlight-color: transparent;
}

.style-sidebar-controls {
  background: var(--ui-bg);
}

.style-mobile-card {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg-muted);
  padding: 12px 12px 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.24);
}

.style-mobile-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  flex-shrink: 0;
  border: 1px solid var(--ui-border-muted);
  border-radius: 10px;
  background: color-mix(in oklch, var(--ui-bg-elevated) 72%, var(--ui-bg));
  padding: 3px;
}

.style-mobile-tab {
  display: inline-flex;
  height: 28px;
  min-width: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 16px;
  outline: none;
  padding: 0 10px;
  transition-property: background-color, border-color, color, transform;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.style-mobile-tab:hover {
  background: color-mix(in oklch, var(--ui-bg-accented) 60%, transparent);
  color: var(--ui-text-highlighted);
}

.style-mobile-tab:active {
  transform: scale(0.96);
}

.style-mobile-tab[data-active] {
  border-color: color-mix(in oklch, var(--ui-primary) 35%, var(--ui-border));
  background: color-mix(in oklch, var(--ui-primary) 18%, transparent);
  color: var(--ui-text-highlighted);
}

.style-mobile-scroll,
.style-sidebar-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.style-mobile-scroll {
  margin-top: 12px;
  padding-right: 4px;
}

.style-mobile-scroll::-webkit-scrollbar,
.style-sidebar-scroll::-webkit-scrollbar {
  display: none;
}

.style-mobile-content,
.style-sidebar-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-inline: 1px;
  padding-bottom: 16px;
}

.style-sidebar-content {
  gap: 0;
}

.style-sidebar-content .style-section-parts {
  order: 1;
}

.style-sidebar-content .style-section-mode {
  order: 2;
}

.style-sidebar-content .style-section-scene {
  order: 3;
}

.style-mobile-section {
  margin-bottom: 12px;
}

.style-section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.style-section-heading {
  margin: 0 0 8px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.5;
  text-transform: uppercase;
}

.style-section-divider {
  min-width: 0;
  flex: 1;
  height: 1px;
  margin-top: 8px;
  margin-bottom: 16px;
  border-top: 1px solid var(--ui-border-muted);
}

.style-section-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.style-control-row {
  position: relative;
  display: flex;
  width: 100%;
  height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  overflow: visible;
  border: 1px solid var(--ui-border-muted);
  border-radius: 8px;
  background: color-mix(in oklch, var(--ui-bg-elevated) 74%, var(--ui-bg-muted));
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 16px;
  padding: 0 6px 0 10px;
}

.style-row-label {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-highlighted);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-pill-group {
  display: inline-flex;
  min-width: 0;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.style-select-pill {
  display: inline-flex;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: color-mix(in oklch, var(--ui-bg-accented) 72%, transparent);
  color: var(--ui-text-toned);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 16px;
  padding: 0 8px;
  transition-property: background-color, color, transform, opacity, filter;
  transition-duration: 170ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  white-space: nowrap;
}

.style-select-pill:hover {
  color: var(--ui-text-highlighted);
}

.style-select-pill:active {
  transform: scale(0.96);
}

.style-select-pill[data-active] {
  background: color-mix(in oklch, var(--ui-primary) 22%, var(--ui-bg-accented));
  color: var(--ui-text-highlighted);
}

.style-color-controls {
  display: flex;
  min-width: 0;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
}

.style-hex-input {
  width: 72px;
  height: 24px;
  border: 1px solid var(--ui-border-muted);
  border-radius: 6px;
  outline: 0;
  background: color-mix(in oklch, var(--ui-bg) 52%, transparent);
  color: var(--ui-text-toned);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 24px;
  padding: 0 6px;
  text-transform: uppercase;
  transition-property: border-color, color, background-color;
  transition-duration: 150ms;
}

.style-hex-input:focus {
  border-color: color-mix(in oklch, var(--ui-primary) 40%, var(--ui-border));
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}

.style-swatch {
  position: relative;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--ui-border-accented);
  border-radius: 9999px;
  cursor: pointer;
  transition-property: border-color, transform;
  transition-duration: 150ms;
}

.style-swatch:hover {
  border-color: color-mix(in oklch, var(--ui-primary) 55%, var(--ui-border));
  transform: scale(1.05);
}

.style-swatch input {
  position: absolute;
  inset: -6px;
  width: calc(100% + 12px);
  height: calc(100% + 12px);
  cursor: pointer;
  opacity: 0;
}

.style-mobile-save-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--ui-border-muted);
  background: transparent;
  padding-top: 8px;
  padding-bottom: max(env(safe-area-inset-bottom), 0px);
}

.style-reset-button {
  display: inline-flex;
  width: 100%;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-primary);
  border-radius: 8px;
  background: var(--ui-primary);
  color: var(--ui-text-inverted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  padding: 0 12px;
  transition-property: background-color, border-color, transform, opacity;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.style-reset-button:hover {
  background: color-mix(in oklch, var(--ui-primary) 88%, var(--ui-bg-inverted));
}

.style-reset-button:active {
  transform: scale(0.96);
}

.style-sidebar-shell {
  position: relative;
  min-height: 0;
  height: 100%;
  padding: 4.75rem 12px 12px 8px;
}

.style-sidebar-inner {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  pointer-events: auto;
}

.style-sidebar-save-bar {
  padding-top: 12px;
  padding-bottom: 6px;
}

</style>
