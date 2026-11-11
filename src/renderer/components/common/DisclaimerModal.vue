<template>
  <Teleport to="body">
    <Transition name="disclaimer-modal">
      <div
        v-if="showDisclaimer"
        class="fixed inset-0 z-[999999] flex items-center justify-center bg-[#12241d]/55"
        :class="{ 'android-hig-disclaimer': isAndroidApp }"
      >
        <div
          class="disclaimer-sheet w-full max-w-md mx-4 bg-white dark:bg-[#18221e] rounded-2xl overflow-hidden shadow-2xl"
        >
          <div class="h-1 bg-[#4b8170]"></div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white px-7 mt-8">
            {{ t('comp.disclaimer.title') }}
          </h2>

          <div class="px-7 py-6">
            <div class="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <div
                class="p-4 rounded-xl bg-[#edf4f0] dark:bg-[#263b32] border border-[#dfece5] dark:border-[#385247]"
              >
                <div class="flex items-start gap-3">
                  <i class="ri-alert-line text-[#56836f] text-xl flex-shrink-0 mt-0.5"></i>
                  <p class="text-[#365d4d] dark:text-[#cee4d8]">
                    {{ t('comp.disclaimer.warning') }}
                  </p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-start gap-3">
                  <div
                    class="w-6 h-6 rounded-full bg-[#edf3f0] dark:bg-[#2d4137] flex items-center justify-center flex-shrink-0"
                  >
                    <i class="ri-book-2-line text-[#608576] text-sm"></i>
                  </div>
                  <p>{{ t('comp.disclaimer.item1') }}</p>
                </div>

                <div class="flex items-start gap-3">
                  <div
                    class="w-6 h-6 rounded-full bg-[#edf3f0] dark:bg-[#2d4137] flex items-center justify-center flex-shrink-0"
                  >
                    <i class="ri-time-line text-[#608576] text-sm"></i>
                  </div>
                  <p>{{ t('comp.disclaimer.item2') }}</p>
                </div>

                <div class="flex items-start gap-3">
                  <div
                    class="w-6 h-6 rounded-full bg-[#edf3f0] dark:bg-[#2d4137] flex items-center justify-center flex-shrink-0"
                  >
                    <i class="ri-shield-check-line text-[#608576] text-sm"></i>
                  </div>
                  <p>{{ t('comp.disclaimer.item3') }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="px-6 pb-8 space-y-3">
            <button
              @click="handleAgree"
              class="w-full py-3 rounded-xl text-sm font-semibold text-white bg-[#315f55] hover:bg-[#274f46] active:scale-[0.98] transition-transform duration-150 shadow-green-500/25"
            >
              <span class="flex items-center justify-center gap-2">
                <i class="ri-check-line text-lg"></i>
                {{ t('comp.disclaimer.agree') }}
              </span>
            </button>

            <button
              @click="handleDisagree"
              class="w-full py-3 rounded-2xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {{ t('comp.disclaimer.disagree') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { isAndroidApp, isElectron, isLyricWindow } from '@/utils';

const { t } = useI18n();

const DISCLAIMER_AGREED_KEY = 'disclaimer_agreed_timestamp';

const showDisclaimer = ref(false);
const isTransitioning = ref(false);

const shouldShowDisclaimer = () => {
  return !localStorage.getItem(DISCLAIMER_AGREED_KEY);
};

const handleAgree = () => {
  if (isTransitioning.value) return;
  isTransitioning.value = true;

  localStorage.setItem(DISCLAIMER_AGREED_KEY, Date.now().toString());
  showDisclaimer.value = false;
  isTransitioning.value = false;
};

const handleDisagree = () => {
  if (isTransitioning.value) return;
  isTransitioning.value = true;

  if (isElectron) {
    window.api?.quitApp?.();
  } else {
    window.close();
  }
  isTransitioning.value = false;
};

onMounted(() => {
  if (isLyricWindow.value) return;

  if (shouldShowDisclaimer()) {
    showDisclaimer.value = true;
    return;
  }
});
</script>

<style scoped>
.disclaimer-modal-enter-active,
.disclaimer-modal-leave-active {
  transition: opacity 0.3s ease;
}

.disclaimer-modal-enter-from,
.disclaimer-modal-leave-to {
  opacity: 0;
}

.android-hig-disclaimer {
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
}

.android-hig-disclaimer .disclaimer-sheet {
  max-height: calc(
    100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--divider, #d9d9de) 70%, transparent);
  border-radius: 28px;
  background: color-mix(in srgb, var(--canvas, #ffffff) 94%, transparent);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
}

.android-hig-disclaimer .disclaimer-sheet > div:first-child {
  display: none;
}

.android-hig-disclaimer .disclaimer-sheet button:first-child {
  min-height: 48px;
  border-radius: 16px;
  background: var(--accent, #fa2d48);
  box-shadow: none;
}

.android-hig-disclaimer .disclaimer-sheet button:last-child {
  min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
  .disclaimer-modal-enter-active,
  .disclaimer-modal-leave-active {
    transition: none;
  }
}

.donate-modal-enter-active,
.donate-modal-leave-active {
  transition: opacity 0.3s ease;
}

.donate-modal-enter-from,
.donate-modal-leave-to {
  opacity: 0;
}

.qrcode-modal-enter-active,
.qrcode-modal-leave-active {
  transition: opacity 0.3s ease;
}

.qrcode-modal-enter-from,
.qrcode-modal-leave-to {
  opacity: 0;
}
</style>
