<script setup lang="ts">
const { user, requestVerification, refreshUser, signOut } = useAuth()

const sending = ref(false)
const refreshing = ref(false)
const message = ref('')
const error = ref('')

async function onResend() {
  error.value = ''
  message.value = ''
  const email = user.value?.email
  if (!email) {
    error.value = 'No email address on file.'
    return
  }
  sending.value = true
  try {
    await requestVerification(email)
    message.value = `We sent a verification code to ${email}.`
  }
  catch (err: unknown) {
    error.value = (err as { message?: string } | null)?.message ?? 'Could not send the verification email.'
  }
  finally {
    sending.value = false
  }
}

async function onAlreadyVerified() {
  error.value = ''
  refreshing.value = true
  try {
    await refreshUser()
  }
  catch (err: unknown) {
    error.value = (err as { message?: string } | null)?.message ?? 'Could not refresh your session.'
  }
  finally {
    refreshing.value = false
  }
}

async function onSignOut() {
  await signOut()
}
</script>

<template>
  <div class="flex h-full w-full items-center justify-center px-4 py-8">
    <div class="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-default p-6 shadow-xl ring-1 ring-default/60 sm:p-8">
      <div class="flex flex-col gap-1">
        <h2 class="text-balance text-lg font-semibold text-highlighted">
          Verify your email
        </h2>
        <p class="text-pretty text-sm leading-relaxed text-muted">
          We sent a verification code to
          <span class="font-medium text-highlighted">{{ user?.email ?? 'your email' }}</span>.
          You need to verify your email before you can sync to the cloud or publish projects.
        </p>
      </div>

      <UAlert
        v-if="message"
        color="success"
        variant="soft"
        :title="message"
      />
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
      />

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <UButton
          label="Resend verification"
          color="primary"
          icon="i-lucide-mail"
          :loading="sending"
          :disabled="refreshing"
          class="min-h-10 justify-center transition-transform active:scale-[0.97]"
          @click="onResend"
        />
        <UButton
          label="Already verified — refresh"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="refreshing"
          :disabled="sending"
          class="min-h-10 justify-center transition-transform active:scale-[0.97]"
          @click="onAlreadyVerified"
        />
      </div>

      <UButton
        label="Sign out"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-log-out"
        class="min-h-10 self-start transition-transform active:scale-[0.97]"
        :disabled="sending || refreshing"
        @click="onSignOut"
      />
    </div>
  </div>
</template>
