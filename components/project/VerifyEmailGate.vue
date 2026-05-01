<script setup lang="ts">
const { user, requestVerification, signOut } = useAuth()
const { $pb } = useNuxtApp()

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
    message.value = `We sent a verification link to ${email}.`
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
    await ($pb as { collection: (n: string) => { authRefresh: () => Promise<unknown> } })
      .collection('users')
      .authRefresh()
    if (import.meta.client) window.location.reload()
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
    <div class="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-default bg-default p-6 shadow-xl">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-highlighted">
          Verify your email
        </h2>
        <p class="text-sm text-muted">
          We sent a verification link to
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
          class="justify-center"
          @click="onResend"
        />
        <UButton
          label="Already verified — refresh"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="refreshing"
          :disabled="sending"
          class="justify-center"
          @click="onAlreadyVerified"
        />
      </div>

      <UButton
        label="Sign out"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-log-out"
        class="self-start"
        :disabled="sending || refreshing"
        @click="onSignOut"
      />
    </div>
  </div>
</template>
