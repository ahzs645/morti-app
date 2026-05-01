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
  step.value === 'email' ? 'Sign in with email' : 'Enter your code',
)
const description
  = 'We’ll email you a one-time code. New accounts are created automatically and must verify email before editing or using the cloud.'

watch(
  open,
  (v) => {
    if (v) {
      errorMsg.value = ''
      loading.value = false
      step.value = 'email'
      code.value = ''
      otpId.value = ''
    }
  },
)

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
    errorMsg.value
      = err?.statusMessage || err?.message || 'Something went wrong.'
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
    errorMsg.value
      = err?.statusMessage || err?.message || 'Something went wrong.'
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
    :title="title"
    :description="description"
    :dismissible="false"
  >
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
        <p class="text-pretty text-sm text-muted">
          We sent a code to
          <span class="font-medium text-highlighted">{{ email.trim() }}</span>.
        </p>
        <UFormField
          label="Code"
          class="w-full"
        >
          <UInput
            v-model="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full"
            :ui="{ base: 'min-h-10 tabular-nums tracking-widest' }"
            placeholder="123456"
            @keydown.enter.prevent="submitCode"
          />
        </UFormField>
        <UButton
          variant="link"
          color="primary"
          class="self-start px-0"
          label="Use a different email"
          @click="resendCode"
        />
      </template>
    </div>

    <template #footer="{ close }">
      <div class="grid w-full grid-cols-2 gap-2">
        <UButton
          label="Cancel"
          type="button"
          color="neutral"
          variant="outline"
          class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :disabled="loading"
          @click="close()"
        />
        <UButton
          v-if="step === 'email'"
          label="Send code"
          type="button"
          class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :loading="loading"
          @click="submitEmail"
        />
        <UButton
          v-else
          label="Sign in"
          type="button"
          class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
          :loading="loading"
          @click="submitCode"
        />
      </div>
    </template>
  </AppDialog>
</template>
