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
}

const props = withDefaults(defineProps<Props>(), {
  hint: '',
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
  <UPopover v-model:open="open" :content="{ side: 'top', align: 'start', sideOffset: 8, collisionPadding: 12 }">
    <button
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
      <div class="w-[320px] max-h-[70vh] overflow-y-auto scrollbar-thin rounded-2xl bg-muted/95 p-3 shadow-xl ring-1 ring-default/60 backdrop-blur">
        <div class="mb-2 flex items-baseline justify-between gap-2 px-1">
          <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {{ label }} material
          </p>
          <p
            v-if="hint"
            class="truncate text-[10px] text-muted/80"
          >{{ hint }}</p>
        </div>

        <template
          v-for="group in grouped"
          :key="group.category"
        >
          <p class="mt-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/80">
            {{ group.category }}
          </p>
          <div class="mt-1.5 grid grid-cols-2 gap-2">
            <button
              v-for="preset in group.items"
              :key="preset.id"
              type="button"
              class="group/card relative flex flex-col overflow-hidden rounded-xl bg-default text-left ring-1 transition-[transform,box-shadow,--tw-ring-color] duration-150 active:scale-[0.97]"
              :class="modelValue === preset.id
                ? 'ring-2 ring-primary'
                : 'ring-default/60 hover:ring-[color:color-mix(in_oklch,var(--color-morti-400)_50%,transparent)]'"
              :aria-label="`${preset.label}, ${preset.sheenLabel}`"
              :aria-pressed="modelValue === preset.id"
              @click="pickPreset(preset.id)"
            >
              <span
                class="relative block h-[60px] w-full"
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
                <span class="truncate text-[11px] font-semibold leading-tight text-highlighted">
                  {{ preset.label }}
                </span>
                <span class="truncate text-[10px] leading-tight text-muted">
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
          class="mt-1.5 flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl bg-default ring-1 transition-[box-shadow] duration-150"
          :class="isCustom ? 'ring-2 ring-primary' : 'ring-default/60 hover:ring-[color:color-mix(in_oklch,var(--color-morti-400)_50%,transparent)]'"
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
