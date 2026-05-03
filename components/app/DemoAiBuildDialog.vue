<script setup lang="ts">
import { AI_FURNITURE_PROMPT_MAX_LENGTH } from '~~/shared/domain/ai-furniture'

interface Props {
  /** When true, the gated state is shown after clicking Generate. When false, generate works normally (parent handles). */
  requireSignup?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  requireSignup: true,
})

const emit = defineEmits<{
  (e: 'request-signup', prompt: string): void
  (e: 'generate', prompt: string): void
}>()

const open = defineModel<boolean>('open', { required: true })

const prompt = ref('')
const stage = ref<'compose' | 'gated'>('compose')
const promptInputRef = ref<HTMLTextAreaElement | null>(null)

const promptLength = computed(() => prompt.value.trim().length)
const promptOverLimit = computed(() => promptLength.value > AI_FURNITURE_PROMPT_MAX_LENGTH)
const canGenerate = computed(() => promptLength.value > 0 && !promptOverLimit.value)

const promptExamples = [
  { label: 'Media console', prompt: 'A 1.8m wide media console with 6 modules, doors on both sides, and drawers in the middle.' },
  { label: 'Bookshelf', prompt: 'A tall bookshelf with 4 even columns, mostly open shelves, and two lower drawers.' },
  { label: 'Wardrobe', prompt: 'A wardrobe with 3 wide columns, full-height doors on the sides, and stacked drawers in the center.' },
]

function useExample(text: string) {
  prompt.value = text
  nextTick(() => promptInputRef.value?.focus())
}

function onGenerateClick() {
  if (!canGenerate.value) return
  if (props.requireSignup) {
    stage.value = 'gated'
    emit('request-signup', prompt.value.trim())
  }
  else {
    emit('generate', prompt.value.trim())
  }
}

function backToCompose() {
  stage.value = 'compose'
  nextTick(() => promptInputRef.value?.focus())
}

watch(open, (next) => {
  if (next) {
    stage.value = 'compose'
    nextTick(() => promptInputRef.value?.focus())
  }
})
</script>

<template>
  <AppDialog
    v-model:open="open"
    size="lg"
  >
    <template #prependBody>
      <header class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2">
          <span class="demo-ai-spark relative grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <UIcon
              name="i-lucide-sparkles"
              class="size-5"
            />
            <span
              class="demo-ai-spark-pulse pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/40"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-balance text-lg font-semibold tracking-[-0.01em] text-highlighted sm:text-xl">
              Build your own with AI
            </h2>
            <p class="text-pretty text-sm text-muted">
              Describe a cabinet, shelf, or wardrobe — we'll lay it out for you.
            </p>
          </div>
        </div>
      </header>
    </template>

    <Transition
      name="demo-ai-stage"
      mode="out-in"
    >
      <div
        v-if="stage === 'compose'"
        key="compose"
        class="grid gap-4"
      >
        <div class="grid gap-3 rounded-xl bg-muted p-3 shadow-sm ring-1 ring-default/60">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <label
              for="demo-ai-prompt"
              class="text-sm font-medium text-highlighted"
            >
              Your idea
            </label>
            <span
              class="text-[11px] tabular-nums"
              :class="promptOverLimit ? 'text-error' : 'text-muted'"
            >
              {{ promptLength }} / {{ AI_FURNITURE_PROMPT_MAX_LENGTH }}
            </span>
          </div>
          <textarea
            id="demo-ai-prompt"
            ref="promptInputRef"
            v-model="prompt"
            rows="5"
            :maxlength="AI_FURNITURE_PROMPT_MAX_LENGTH"
            placeholder="e.g. 1.8m wide media console, three columns, drawers in the middle, doors on both sides"
            class="block min-h-36 w-full resize-y rounded-lg bg-default px-3 py-3 text-sm leading-6 text-highlighted shadow-sm outline-none ring-1 ring-default/70 transition-[background-color,box-shadow] duration-150 placeholder:text-muted focus:bg-elevated focus:ring-2 focus:ring-primary/70"
            @keydown.meta.enter.prevent="onGenerateClick"
            @keydown.ctrl.enter.prevent="onGenerateClick"
          />
          <div class="flex min-w-0 flex-wrap gap-1.5">
            <button
              v-for="example in promptExamples"
              :key="example.label"
              type="button"
              class="min-h-8 rounded-full bg-elevated px-3 text-xs font-medium text-toned shadow-sm ring-1 ring-default/60 transition-[transform,background-color,color] duration-150 hover:bg-accented hover:text-highlighted active:scale-[0.97]"
              @click="useExample(example.prompt)"
            >
              {{ example.label }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-else
        key="gated"
        class="demo-ai-gated grid gap-4"
      >
        <div class="demo-ai-stagger-1 relative overflow-hidden rounded-xl bg-default p-4 shadow-md ring-1 ring-primary/40">
          <div
            class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_oklch,var(--ui-primary)_18%,transparent)_0%,transparent_60%)]"
            aria-hidden="true"
          />
          <div class="flex items-center gap-2 pb-2">
            <UIcon
              name="i-lucide-bookmark-check"
              class="size-4 text-primary"
            />
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
              Your idea is saved
            </p>
          </div>
          <p class="text-pretty text-sm leading-relaxed text-highlighted">
            "{{ prompt.trim() }}"
          </p>
        </div>

        <div class="demo-ai-stagger-2 grid gap-2.5 text-pretty text-center">
          <h3 class="text-balance text-base font-semibold text-highlighted sm:text-lg">
            One free account away from bringing it to life.
          </h3>
          <p class="text-pretty text-sm text-muted">
            Sign up to generate, edit, and export this design — and any others you can imagine.
          </p>
        </div>

        <div class="demo-ai-stagger-3 grid gap-2 pt-1">
          <UButton
            block
            size="lg"
            color="primary"
            variant="solid"
            label="Sign up free"
            icon="i-lucide-sparkles"
            class="min-h-12 justify-center text-sm font-semibold shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/10 transition-[transform,box-shadow] duration-150 ease-out hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97]"
            @click="emit('request-signup', prompt.trim())"
          />
          <UButton
            block
            color="neutral"
            variant="ghost"
            label="Edit prompt"
            icon="i-lucide-arrow-left"
            class="min-h-10 justify-center transition-transform active:scale-[0.97]"
            @click="backToCompose"
          />
        </div>
      </div>
    </Transition>

    <template
      v-if="stage === 'compose'"
      #footer="{ close }"
    >
      <div class="grid w-full grid-cols-3 gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          class="col-span-1 w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          @click="close()"
        />
        <UButton
          label="Generate"
          icon="i-lucide-sparkles"
          color="primary"
          class="col-span-2 w-full min-h-10 min-w-0 justify-center shadow-md shadow-primary/20 transition-[transform,box-shadow] duration-150 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
          :disabled="!canGenerate"
          @click="onGenerateClick"
        />
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.demo-ai-stage-enter-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1);
}
.demo-ai-stage-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.demo-ai-stage-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.demo-ai-stage-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.demo-ai-stagger-1,
.demo-ai-stagger-2,
.demo-ai-stagger-3 {
  animation: demo-ai-rise 360ms cubic-bezier(0.2, 0, 0, 1) both;
}
.demo-ai-stagger-1 {
  animation-delay: 40ms;
}
.demo-ai-stagger-2 {
  animation-delay: 140ms;
}
.demo-ai-stagger-3 {
  animation-delay: 240ms;
}

@keyframes demo-ai-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.demo-ai-spark-pulse {
  animation: demo-ai-spark 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes demo-ai-spark {
  0%, 100% {
    opacity: 0;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-ai-stage-enter-active,
  .demo-ai-stage-leave-active,
  .demo-ai-stagger-1,
  .demo-ai-stagger-2,
  .demo-ai-stagger-3,
  .demo-ai-spark-pulse {
    animation: none;
    transition: none;
  }
}
</style>
