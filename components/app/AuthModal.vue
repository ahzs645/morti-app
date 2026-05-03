<script setup lang="ts">
const emit = defineEmits<{
  (e: 'success'): void
}>()
const open = defineModel<boolean>('open', { required: true })

const { requestOtp, authWithOtp } = useAuth()

const step = ref<'email' | 'code'>('email')
const email = ref('')
const otpId = ref('')
const code = ref('')
const errorMsg = ref('')
const loading = ref(false)

const title = computed(() =>
  step.value === 'email' ? 'Sign in' : 'Check your email',
)
const description = computed(() =>
  step.value === 'email'
    ? 'We’ll email you a one-time code.'
    : 'Enter the 6-digit code we just sent.',
)
const stepIndex = computed(() => (step.value === 'email' ? 1 : 2))

watch(open, (v) => {
  if (v) {
    errorMsg.value = ''
    loading.value = false
    step.value = 'email'
    code.value = ''
    otpId.value = ''
  }
})

async function submitEmail() {
  errorMsg.value = ''
  const e = email.value.trim()
  if (!e) {
    errorMsg.value = 'Enter your email address.'
    return
  }
  loading.value = true
  try {
    const res = await requestOtp(e)
    otpId.value = res.otpId
    step.value = 'code'
  }
  catch (err: any) {
    errorMsg.value = err?.statusMessage || err?.message || 'Something went wrong.'
  }
  finally {
    loading.value = false
  }
}

async function submitCode() {
  errorMsg.value = ''
  loading.value = true
  try {
    await authWithOtp(otpId.value, code.value)
    open.value = false
    email.value = ''
    code.value = ''
    otpId.value = ''
    step.value = 'email'
    emit('success')
  }
  catch (err: any) {
    errorMsg.value = err?.statusMessage || err?.message || 'Something went wrong.'
  }
  finally {
    loading.value = false
  }
}

function resendCode() {
  errorMsg.value = ''
  step.value = 'email'
  code.value = ''
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :dismissible="false"
  >
    <template #prependBody>
      <header class="flex flex-col gap-3">
        <div
          class="flex items-center gap-3"
          role="progressbar"
          :aria-valuenow="stepIndex"
          aria-valuemin="1"
          aria-valuemax="2"
          :aria-label="`Step ${stepIndex} of 2`"
        >
          <span
            class="h-1 flex-1 rounded-full bg-primary transition-colors duration-300"
          />
          <span
            class="h-1 flex-1 rounded-full transition-colors duration-300"
            :class="stepIndex === 2 ? 'bg-primary' : 'bg-elevated'"
          />
          <span class="text-xs tabular-nums text-muted">{{ stepIndex }}/2</span>
        </div>

        <Transition
          name="auth-title"
          mode="out-in"
        >
          <div
            :key="step"
            class="flex flex-col gap-1"
          >
            <h2 class="text-balance text-lg font-semibold text-highlighted">
              {{ title }}
            </h2>
            <p class="text-pretty text-sm text-muted">
              {{ description }}
            </p>
          </div>
        </Transition>
      </header>
    </template>

    <div class="flex flex-col gap-3">
      <UAlert
        v-if="errorMsg"
        color="error"
        variant="soft"
        :title="errorMsg"
      />

      <template v-if="step === 'email'">
        <UFormField
          label="Email"
          class="w-full"
        >
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            class="w-full"
            :ui="{ base: 'min-h-10' }"
            placeholder="you@example.com"
            @keydown.enter.prevent="submitEmail"
          />
        </UFormField>
      </template>

      <template v-else>
        <div class="flex items-baseline justify-between gap-2">
          <p class="truncate text-sm text-muted">
            Sent to
            <span class="font-medium text-highlighted">{{ email.trim() }}</span>
          </p>
          <UButton
            variant="link"
            color="primary"
            size="xs"
            class="shrink-0 px-0"
            label="Change"
            @click="resendCode"
          />
        </div>
        <UFormField
          label="Verification code"
          class="w-full"
        >
          <UInput
            v-model="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            class="w-full"
            :ui="{ base: 'min-h-14 text-center text-2xl font-medium tabular-nums tracking-[0.4em]' }"
            placeholder="——————"
            @keydown.enter.prevent="submitCode"
          />
        </UFormField>
      </template>
    </div>

    <template #footer="{ close }">
      <div class="grid w-full grid-cols-3 gap-2">
        <UButton
          label="Cancel"
          type="button"
          color="neutral"
          variant="ghost"
          class="col-span-1 w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :disabled="loading"
          @click="close()"
        />
        <UButton
          v-if="step === 'email'"
          label="Send code"
          type="button"
          class="col-span-2 w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :loading="loading"
          @click="submitEmail"
        />
        <UButton
          v-else
          label="Sign in"
          type="button"
          class="col-span-2 w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :loading="loading"
          @click="submitCode"
        />
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.auth-title-enter-active,
.auth-title-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.auth-title-enter-from,
.auth-title-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .auth-title-enter-active,
  .auth-title-leave-active {
    transition: none;
  }
}
</style>
