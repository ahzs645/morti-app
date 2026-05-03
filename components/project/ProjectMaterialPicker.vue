<script setup lang="ts">
import {
  CUSTOM_GRADIENT,
  CUSTOM_MATERIAL_ID,
  MATERIAL_CATEGORY_ORDER,
  MATERIAL_PRESETS,
  chipBackgroundStyle,
  findPreset,
  sheenOverlay,
  type MaterialPreset,
} from '~~/shared/domain/materials'

interface Props {
  label: string
  hint?: string
  modelValue: string
  customColor: string
  variant?: 'card' | 'row'
}

const props = withDefaults(defineProps<Props>(), {
  hint: '',
  variant: 'card',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:customColor', value: string): void
}>()

const open = ref(false)

const selected = computed<MaterialPreset | null>(() => findPreset(props.modelValue))
const isCustom = computed(() => props.modelValue === CUSTOM_MATERIAL_ID)

// Normalizer guarantees presetId is either a known preset or CUSTOM_MATERIAL_ID,
// so `selected === null && !isCustom` is unreachable — only two branches needed.
const triggerLabel = computed(() => selected.value?.label ?? 'Custom')
const triggerSheen = computed(() => selected.value?.sheenLabel ?? 'Hex override')

const triggerThumbStyle = computed<Record<string, string>>(() => {
  if (selected.value) return chipBackgroundStyle(selected.value.grain, selected.value.hex)
  return { backgroundColor: props.customColor, backgroundImage: 'none' }
})

const triggerSheenStyle = computed<Record<string, string>>(() => {
  return { backgroundImage: sheenOverlay(selected.value?.sheen ?? 'satin') }
})

const grouped = computed(() =>
  MATERIAL_CATEGORY_ORDER
    .map(category => ({
      category,
      items: MATERIAL_PRESETS.filter(p => p.category === category),
    }))
    .filter(g => g.items.length > 0),
)

function pickPreset(id: string) {
  emit('update:modelValue', id)
  open.value = false
}

function onCustomInput(event: Event) {
  const value = (event.target as HTMLInputElement | null)?.value ?? '#888888'
  emit('update:customColor', value)
  if (props.modelValue !== CUSTOM_MATERIAL_ID) emit('update:modelValue', CUSTOM_MATERIAL_ID)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'top', align: 'center', sideOffset: 8, collisionPadding: 12 }"
    :ui="{ content: 'bg-transparent p-0 shadow-none ring-0 rounded-none overflow-visible' }"
  >
    <button
      v-if="variant === 'row'"
      type="button"
      class="flex h-[34px] w-full items-center justify-between gap-2 rounded-lg border border-default bg-default px-2.5 text-left text-xs text-muted transition-[background-color,border-color,transform] duration-150 hover:border-accented hover:bg-accented/40 active:scale-[0.98]"
      :aria-label="`${label}: ${triggerLabel}, ${triggerSheen}`"
    >
      <span class="min-w-0 truncate font-medium text-highlighted">{{ label }}</span>
      <span class="flex min-w-0 shrink items-center gap-2">
        <span
          class="relative size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-default/70"
          :style="triggerThumbStyle"
        >
          <span
            class="absolute inset-0"
            :style="triggerSheenStyle"
          />
        </span>
        <span class="max-w-32 truncate font-medium text-toned">{{ triggerLabel }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-3.5 shrink-0 text-muted"
        />
      </span>
    </button>
    <button
      v-else
      type="button"
      class="flex w-full min-h-11 items-center gap-2.5 rounded-xl bg-default px-2 py-1.5 text-left shadow-sm ring-1 ring-default/60 transition-[box-shadow,transform] hover:ring-[color:color-mix(in_oklch,var(--color-morti-400)_40%,var(--ui-border))] active:scale-[0.99]"
      :aria-label="`${label}: ${triggerLabel}, ${triggerSheen}`"
    >
      <span
        class="relative h-9 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-default/70"
        :style="triggerThumbStyle"
      >
        <span
          class="absolute inset-0"
          :style="triggerSheenStyle"
        />
      </span>
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{{ label }}</span>
        <span class="block truncate text-xs font-semibold text-highlighted">{{ triggerLabel }}</span>
      </span>
      <span
        v-if="triggerSheen"
        class="hidden shrink-0 text-[10px] text-muted sm:block"
      >{{ triggerSheen }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3.5 shrink-0 text-muted"
      />
    </button>

    <template #content>
      <div class="material-picker-popover scrollbar-thin">
        <div class="material-picker-header">
          <p class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {{ label }} material
          </p>
          <p
            v-if="hint"
            class="min-w-0 max-w-[10rem] truncate text-right text-[10px] text-muted/80"
          >{{ hint }}</p>
        </div>

        <template
          v-for="group in grouped"
          :key="group.category"
        >
          <p class="mt-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/80">
            {{ group.category }}
          </p>
          <div class="material-picker-grid mt-1.5 grid grid-cols-2 gap-2">
            <button
              v-for="preset in group.items"
              :key="preset.id"
              type="button"
              class="material-preset-card group/card relative flex flex-col overflow-hidden rounded-xl bg-default text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.96]"
              :class="modelValue === preset.id
                ? 'is-selected'
                : undefined"
              :aria-label="`${preset.label}, ${preset.sheenLabel}`"
              :aria-pressed="modelValue === preset.id"
              @click="pickPreset(preset.id)"
            >
              <span
                class="material-picker-chip relative block h-[60px] w-full"
                :style="chipBackgroundStyle(preset.grain, preset.hex)"
              >
                <span
                  class="absolute inset-0"
                  :style="{ backgroundImage: sheenOverlay(preset.sheen) }"
                />
                <span
                  v-if="modelValue === preset.id"
                  class="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-inverted shadow"
                  aria-hidden="true"
                >
                  <UIcon name="i-lucide-check" class="size-3" />
                </span>
              </span>
              <span class="flex flex-col gap-0 px-2 py-1.5">
                <span class="truncate text-[11px] font-semibold leading-tight text-highlighted text-pretty">
                  {{ preset.label }}
                </span>
                <span class="truncate text-[10px] leading-tight text-muted text-pretty">
                  {{ preset.sheenLabel }}
                </span>
              </span>
            </button>
          </div>
        </template>

        <p class="mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/80">
          Custom
        </p>
        <label
          role="radio"
          :aria-checked="isCustom"
          aria-label="Custom hex color"
          class="material-custom-row mt-1.5 flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl bg-default transition-[box-shadow,transform] duration-150 active:scale-[0.96]"
          :class="isCustom ? 'is-selected' : undefined"
        >
          <span
            class="relative block h-[44px] w-16 shrink-0"
            :style="{ background: isCustom ? customColor : CUSTOM_GRADIENT }"
          >
            <span
              class="absolute inset-0"
              :style="{ backgroundImage: sheenOverlay('satin') }"
            />
          </span>
          <span class="min-w-0 flex-1 py-1.5 leading-tight">
            <span class="block text-[11px] font-semibold text-highlighted">Custom color…</span>
            <span class="block font-mono text-[10px] tabular-nums text-muted">{{ customColor.toUpperCase() }}</span>
          </span>
          <input
            type="color"
            class="mr-2 size-7 shrink-0 cursor-pointer rounded-md border border-default bg-transparent p-0"
            :value="customColor"
            aria-label="Custom hex color"
            @input="onCustomInput"
          >
        </label>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.material-picker-popover {
  box-sizing: border-box;
  isolation: isolate;
  width: min(20rem, calc(100vw - 1.5rem), var(--reka-popover-content-available-width, calc(100vw - 1.5rem)));
  max-height: min(28rem, calc(100dvh - 1.5rem), var(--reka-popover-content-available-height, calc(100dvh - 1.5rem)));
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 18px;
  background: color-mix(in oklch, var(--ui-bg-muted) 97%, transparent);
  padding: 12px;
  box-shadow:
    0 22px 56px rgb(0 0 0 / 0.36),
    0 7px 18px rgb(0 0 0 / 0.2),
    inset 0 0 0 1px color-mix(in oklch, var(--ui-border) 82%, transparent);
  backdrop-filter: blur(12px);
}

.material-picker-header {
  position: sticky;
  top: -12px;
  z-index: 2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: -12px -12px 8px;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(
    to bottom,
    color-mix(in oklch, var(--ui-bg-muted) 98%, transparent) 0%,
    color-mix(in oklch, var(--ui-bg-muted) 96%, transparent) 76%,
    color-mix(in oklch, var(--ui-bg-muted) 0%, transparent) 100%
  );
  padding: 12px 13px 10px;
  backdrop-filter: blur(12px);
}

.material-preset-card,
.material-custom-row {
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ui-border-muted) 82%, transparent);
}

.material-preset-card:hover,
.material-custom-row:hover {
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--ui-primary) 38%, var(--ui-border-muted)),
    0 8px 20px rgb(0 0 0 / 0.18);
}

.material-preset-card:focus-visible,
.material-custom-row:focus-visible {
  outline: 2px solid color-mix(in oklch, var(--ui-primary) 62%, transparent);
  outline-offset: 2px;
}

.material-preset-card.is-selected,
.material-custom-row.is-selected {
  box-shadow:
    inset 0 0 0 2px var(--ui-primary),
    0 10px 24px rgb(0 0 0 / 0.22);
}

@media (max-width: 767.98px) {
  .material-picker-popover {
    width: min(20rem, calc(100vw - 2rem), var(--reka-popover-content-available-width, calc(100vw - 2rem)));
    max-height: min(20rem, 48dvh, var(--reka-popover-content-available-height, 48dvh));
    border-radius: 16px;
    padding: 10px;
  }

  .material-picker-header {
    top: -10px;
    margin: -10px -10px 8px;
    border-radius: 16px 16px 0 0;
    padding: 10px 11px 9px;
  }

  .material-picker-grid {
    gap: 6px;
  }

  .material-picker-chip {
    height: 52px;
  }
}

@media (max-width: 359.98px) {
  .material-picker-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
