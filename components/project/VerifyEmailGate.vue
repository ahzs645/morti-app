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
    <div class="w-full max-w-md">
      <div class="rounded-2xl bg-default px-7 pt-7 pb-6 shadow-xl ring-1 ring-default/60">
        <div class="flex flex-col items-center text-center gap-3">
          <div class="size-12 rounded-full bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
            <UIcon name="i-lucide-mail-check" class="size-6 text-primary" />
          </div>
          <p class="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Email verification
          </p>
          <h2 class="text-balance text-2xl font-semibold tracking-[-0.01em] text-highlighted sm:text-[28px]">
            Confirm your email to continue
          </h2>
          <p class="text-pretty text-base leading-relaxed text-toned max-w-xs">
            We sent a verification link to
            <span class="font-semibold text-highlighted break-all">{{ user?.email ?? 'your email' }}</span>.
            Open it on this device, then come back and refresh.
          </p>
        </div>

        <div
          v-if="message || error"
          class="mt-5 flex flex-col gap-2"
        >
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
        </div>

        <div class="mt-7 pt-5 border-t border-default/40 flex flex-col gap-3">
          <UButton
            block
            size="lg"
            color="primary"
            icon="i-lucide-mail"
            :loading="sending"
            :disabled="refreshing"
            class="min-h-11 justify-center transition-transform active:scale-[0.97]"
            label="Resend verification email"
            @click="onResend"
          />
          <button
            type="button"
            class="self-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-highlighted hover:underline disabled:opacity-50"
            :disabled="sending || refreshing"
            @click="onAlreadyVerified"
          >
            {{ refreshing ? 'Refreshing…' : 'Already verified — refresh' }}
          </button>
        </div>
      </div>

      <p class="mt-5 text-center text-sm text-muted">
        Not you?
        <UButton
          variant="link"
          color="neutral"
          size="sm"
          class="px-1 text-muted underline-offset-4 hover:text-highlighted hover:underline"
          :disabled="sending || refreshing"
          label="Sign out"
          @click="onSignOut"
        />
      </p>
    </div>
  </div>
</template>
