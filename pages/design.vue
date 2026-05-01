<script setup lang="ts">
import { getThemeColorTokens } from '~~/composables/useThemeColors'

// --- Modal / slideover open state ---
const modalOpen = ref(false)
const slideoverOpen = ref(false)

// --- Input demo state ---
const projectName = ref('Oak shelf')
const notes = ref('Notes for this piece…')
const snapToGrid = ref(true)
const showDimensions = ref(false)
const units = ref('mm')
const autosave = ref(true)
const search = ref('')
const disabledValue = ref('Read-only value')

const unitItems = [
  { label: 'Millimeters', value: 'mm' },
  { label: 'Inches', value: 'in' },
]

// --- Showcase data ---
const buttonVariants = ['solid', 'outline', 'soft', 'ghost', 'link'] as const
const buttonColors = ['primary', 'neutral', 'error', 'success'] as const
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const badgeVariants = ['solid', 'outline', 'soft', 'subtle'] as const
const badgeColors = ['primary', 'neutral', 'secondary', 'success', 'info', 'warning', 'error'] as const

// --- Theme groups computed ---
const themeGroups = computed(() => {
  const tokens = getThemeColorTokens()
  const map = new Map<string, typeof tokens>()
  for (const t of tokens) {
    const arr = map.get(t.group) ?? []
    arr.push(t)
    map.set(t.group, arr)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
})

function toHex(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`
}
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <div class="mb-8 sm:mb-10">
      <h1 class="text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-4xl">
        Design system
      </h1>
      <p class="mt-2 max-w-2xl text-pretty text-muted">
        Use this page while tuning Nuxt UI.
      </p>
    </div>

    <div class="flex flex-col gap-6 sm:gap-10">
      <!-- 1. Typography -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Typography
          </h2>
        </template>
        <div class="space-y-3">
          <h1 class="text-4xl font-bold text-balance text-highlighted">
            Heading 1
          </h1>
          <h2 class="text-3xl font-bold text-balance text-highlighted">
            Heading 2
          </h2>
          <h3 class="text-2xl font-semibold text-highlighted">
            Heading 3
          </h3>
          <h4 class="text-xl font-semibold text-highlighted">
            Heading 4
          </h4>
          <h5 class="text-lg font-semibold text-highlighted">
            Heading 5
          </h5>
          <h6 class="text-base font-semibold text-highlighted">
            Heading 6
          </h6>
          <p class="text-pretty text-default">
            Body paragraph copy. The quick brown fox jumps over the lazy dog.
          </p>
          <p class="text-pretty text-muted">
            Muted secondary text — for descriptions and supporting copy.
          </p>
          <p class="text-sm text-dimmed">
            Dimmed tertiary text.
          </p>
          <div class="prose dark:prose-invert max-w-none">
            <p>
              Prose sample with <a href="#">inline link</a>, <code>inline code</code>,
              and <strong>bold</strong>/<em>italic</em>.
            </p>
          </div>
        </div>
      </UCard>

      <!-- 2. Theme colors -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Theme colors
          </h2>
        </template>
        <div class="max-h-[70vh] space-y-10 overflow-y-auto pr-1">
          <section
            v-for="grp in themeGroups"
            :key="grp.group"
          >
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ grp.group }}
            </h3>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div
                v-for="tok in grp.items"
                :key="tok.name"
                class="rounded-xl bg-elevated p-3 shadow-sm"
              >
                <div
                  class="mb-2 h-11 w-full rounded-lg ring-1 ring-inset ring-default"
                  :style="{ backgroundColor: `var(${tok.cssVar})` }"
                />
                <p class="font-medium text-highlighted">
                  {{ tok.name }}
                </p>
                <p class="mt-1 break-all font-mono text-[11px] leading-snug text-muted">
                  var({{ tok.cssVar }})
                </p>
                <p class="mt-1 font-mono text-[11px] tabular-nums text-dimmed">
                  {{ toHex(tok.current.hex) }} · {{ tok.current.rgbCss }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </UCard>

      <!-- 3. Buttons -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Buttons
          </h2>
        </template>
        <div class="space-y-8">
          <div
            v-for="variant in buttonVariants"
            :key="variant"
            class="space-y-3"
          >
            <p class="text-sm font-medium capitalize text-muted">
              {{ variant }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="color in buttonColors"
                :key="`${variant}-${color}`"
                :variant="variant"
                :color="color"
                label="Action"
              />
            </div>
          </div>
          <div class="space-y-3">
            <p class="text-sm font-medium text-muted">
              Sizes
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-for="size in sizes"
                :key="size"
                :size="size"
                label="Size"
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-plus"
              label="With icon"
            />
            <UButton
              loading
              label="Loading"
            />
            <UButton
              disabled
              label="Disabled"
            />
          </div>
        </div>
      </UCard>

      <!-- 4. Inputs & controls -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Inputs &amp; controls
          </h2>
        </template>
        <div class="grid max-w-xl gap-6">
          <UFormField
            label="Project name"
            description="Shown in the project list."
          >
            <UInput
              v-model="projectName"
              placeholder="e.g. Kitchen island"
            />
          </UFormField>
          <UFormField label="Search">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Filter projects…"
            />
          </UFormField>
          <UFormField label="Disabled">
            <UInput
              v-model="disabledValue"
              disabled
            />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea
              v-model="notes"
              :rows="4"
              autoresize
            />
          </UFormField>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <UCheckbox
              v-model="snapToGrid"
              label="Snap to grid"
            />
            <UCheckbox
              v-model="showDimensions"
              label="Show dimensions"
            />
          </div>
          <UFormField label="Units">
            <URadioGroup
              v-model="units"
              :items="unitItems"
              orientation="horizontal"
            />
          </UFormField>
          <div class="flex items-center gap-3">
            <USwitch
              v-model="autosave"
              label="Enable autosave"
            />
          </div>
        </div>
      </UCard>

      <!-- 5. Modal & slideover -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Modal &amp; slideover
          </h2>
        </template>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Open dialog"
            @click="modalOpen = true"
          />
          <UButton
            label="Open slideover"
            color="neutral"
            variant="outline"
            @click="slideoverOpen = true"
          />
        </div>

        <AppDialog
          v-model:open="modalOpen"
          title="Delete project?"
          description="This removes the project from this device. This action cannot be undone."
        >
          <p class="text-pretty text-sm text-muted">
            Optional body copy with more detail.
          </p>
          <template #footer="{ close }">
            <div class="flex justify-end gap-2">
              <UButton
                label="Cancel"
                color="neutral"
                variant="ghost"
                @click="close()"
              />
              <UButton
                label="Delete"
                color="error"
                @click="close()"
              />
            </div>
          </template>
        </AppDialog>

        <USlideover
          v-model:open="slideoverOpen"
          title="Inspector"
          description="Side panel pattern for tools and properties."
          side="right"
        >
          <template #body>
            <p class="text-pretty text-sm text-muted">
              Slideover content goes here — dimensions, materials, export options, etc.
            </p>
          </template>
          <template #footer="{ close }">
            <UButton
              class="w-full justify-center"
              label="Done"
              @click="close()"
            />
          </template>
        </USlideover>
      </UCard>

      <!-- 6. Badges -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Badges
          </h2>
        </template>
        <div class="space-y-6">
          <div
            v-for="variant in badgeVariants"
            :key="variant"
            class="space-y-2"
          >
            <p class="text-sm font-medium capitalize text-muted">
              {{ variant }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="color in badgeColors"
                :key="`${variant}-${color}`"
                :variant="variant"
                :color="color"
                :label="color"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- 7. Alerts -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Alerts
          </h2>
        </template>
        <div class="space-y-4">
          <UAlert
            icon="i-lucide-info"
            color="info"
            title="Autosave"
            description="Projects are saved locally in your browser."
          />
          <UAlert
            icon="i-lucide-triangle-alert"
            color="warning"
            title="Unsaved changes"
            description="You have edits that are not yet persisted."
          />
          <UAlert
            icon="i-lucide-circle-check"
            color="success"
            title="Export complete"
            description="Your cut list was downloaded."
          />
          <UAlert
            icon="i-lucide-circle-x"
            color="error"
            title="Could not save"
            description="Storage quota exceeded or access denied."
          />
        </div>
      </UCard>

      <!-- 8. Card layout -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            Card layout
          </h2>
        </template>
        <UCard class="ring ring-default">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-highlighted">Nested card</span>
              <UBadge
                label="WIP"
                color="warning"
                variant="subtle"
              />
            </div>
          </template>
          <p class="text-pretty text-sm text-muted">
            Typical header / body / footer structure for project summaries or settings blocks.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                label="Secondary"
                color="neutral"
                variant="ghost"
                size="sm"
              />
              <UButton
                label="Primary"
                size="sm"
              />
            </div>
          </template>
        </UCard>
      </UCard>
    </div>
  </UContainer>
</template>
