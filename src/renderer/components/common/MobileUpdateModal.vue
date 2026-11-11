<template>
  <Teleport to="body">
    <Transition name="update-modal">
      <div
        v-if="showModal"
        class="fixed inset-0 z-[999999] flex items-end justify-center bg-black/50 backdrop-blur-sm"
        data-android-hig-modal
      >
        <!-- 弹窗内容 -->
        <div
          class="android-update-sheet w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl overflow-hidden animate-slide-up"
        >
          <!-- 顶部装饰条 -->
          <div class="h-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-300"></div>

          <!-- 关闭条 -->
          <div class="flex justify-center pt-3 pb-2">
            <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700"></div>
          </div>

          <!-- 头部信息 -->
          <div class="px-6 pb-5">
            <div class="flex items-center gap-4">
              <!-- 应用图标 -->
              <div
                class="w-20 h-20 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 ring-1 ring-white/40"
              >
                <img src="@/assets/logo.png" alt="App Icon" class="w-full h-full object-cover" />
              </div>

              <!-- 版本信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                  <span
                    class="px-3 py-1 text-xs font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-full"
                  >
                    {{ t('comp.update.title') }}
                  </span>
                </div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white truncate">
                  v{{ updateInfo.latestVersion }}
                </h2>
                <p
                  class="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300"
                >
                  {{ updateInfo.channel }}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ t('comp.update.currentVersion') }}: v{{ updateInfo.currentVersion }}
                </p>
              </div>
            </div>
          </div>

          <!-- 更新内容 -->
          <div
            class="mx-6 mb-6 max-h-80 overflow-y-auto rounded-2xl bg-gray-50 dark:bg-gray-800/50"
          >
            <div
              class="p-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
            >
              {{ releaseNotesText }}
            </div>
          </div>

          <!-- 操作按钮 -->
          <div
            class="px-6 pb-8 flex gap-3"
            :style="{ paddingBottom: `calc(32px + var(--safe-area-inset-bottom, 0px))` }"
          >
            <button
              @click="handleLater"
              class="flex-1 py-4 px-4 rounded-2xl text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all duration-200"
            >
              {{ t('comp.update.noThanks') }}
            </button>
            <button
              @click="handleUpdate"
              class="flex-1 py-4 px-4 rounded-2xl text-base font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-green-500/25"
            >
              <span class="flex items-center justify-center gap-2">
                <i class="ri-download-2-line text-lg"></i>
                {{ downloadButtonLabel }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { checkUpdate, getUpdateChannel, UpdateChannel, UpdateResult } from '@/utils/update';

import config from '../../../../package.json';

const { t } = useI18n();

const showModal = ref(false);
const currentVersion = ref(config.version);
const channel = ref<UpdateChannel>(getUpdateChannel());
let autoCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let appStateListener: { remove: () => Promise<void> } | null = null;
let channelChangeHandler: ((event: Event) => void) | null = null;

const updateInfo = ref<UpdateResult>({
  hasUpdate: false,
  latestVersion: '',
  currentVersion: config.version,
  channel: channel.value,
  releaseInfo: null
});

const releaseNotesText = computed(
  () => updateInfo.value.releaseInfo?.body || '此版本没有附加更新说明。'
);
const downloadButtonLabel = computed(() =>
  updateInfo.value.releaseInfo?.assets.some((asset) => /\.apk$/i.test(asset.name))
    ? '下载 Android 安装包'
    : t('comp.update.nowUpdate')
);
const remindLaterKey = computed(() => `update_remind_later_timestamp:${channel.value}`);

// 检查是否应该显示更新提醒
const shouldShowReminder = (): boolean => {
  const remindLaterTime = localStorage.getItem(remindLaterKey.value);
  if (!remindLaterTime) return true;

  const savedTime = parseInt(remindLaterTime, 10);
  const now = Date.now();
  const oneDayInMs = 24 * 60 * 60 * 1000; // 24小时

  // 如果距离上次点击"稍后提醒"超过24小时，则显示
  return now - savedTime >= oneDayInMs;
};

// 处理"稍后提醒"
const handleLater = () => {
  // 记录当前时间
  localStorage.setItem(remindLaterKey.value, Date.now().toString());
  showModal.value = false;
};

const closeModal = () => {
  showModal.value = false;
};

const checkForUpdates = async () => {
  const now = Date.now();
  const lastCheck = Number(localStorage.getItem(`update:last-auto-check:${channel.value}`) || 0);
  if (now - lastCheck < 6 * 60 * 60 * 1000) return;

  // 检查是否应该显示提醒
  if (!shouldShowReminder()) {
    return;
  }

  try {
    const nativeApp = await import('@capacitor/app');
    const appInfo = await nativeApp.App.getInfo();
    if (appInfo.version) currentVersion.value = appInfo.version;
    const result = await checkUpdate(currentVersion.value, channel.value);
    if (!result.error) localStorage.setItem(`update:last-auto-check:${channel.value}`, String(now));
    if (result && result.hasUpdate) {
      updateInfo.value = result;
      showModal.value = true;
    }
  } catch (error) {
    console.error('检查更新失败:', error);
  }
};

const handleUpdate = async () => {
  const assetUrl = updateInfo.value.releaseInfo?.assets.find((asset) =>
    /\.apk$/i.test(asset.name)
  )?.browser_download_url;
  const releaseUrl = assetUrl || updateInfo.value.releaseInfo?.html_url;
  if (!releaseUrl) return;

  localStorage.removeItem(remindLaterKey.value);
  try {
    await Browser.open({ url: releaseUrl });
  } catch {
    window.open(releaseUrl, '_blank', 'noopener,noreferrer');
  }
  closeModal();
};

onMounted(async () => {
  autoCheckTimeout = setTimeout(() => void checkForUpdates(), 2_000);
  channelChangeHandler = (event: Event) => {
    const next = (event as CustomEvent<UpdateChannel>).detail;
    if (next) {
      channel.value = next;
      void checkForUpdates();
    }
  };
  window.addEventListener('harumusic:update-channel', channelChangeHandler);
  try {
    const nativeApp = await import('@capacitor/app');
    appStateListener = await nativeApp.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void checkForUpdates();
    });
  } catch {
    // The component only runs inside Android; a missing native bridge should not block playback.
  }
});

onUnmounted(() => {
  if (autoCheckTimeout) clearTimeout(autoCheckTimeout);
  if (channelChangeHandler) {
    window.removeEventListener('harumusic:update-channel', channelChangeHandler);
  }
  void appStateListener?.remove();
});
</script>

<style scoped>
[data-android-hig-modal] {
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
}

.android-update-sheet {
  border: 1px solid color-mix(in srgb, var(--divider, #d9d9de) 70%, transparent);
  border-radius: 28px 28px 0 0;
  background: color-mix(in srgb, var(--canvas, #ffffff) 94%, transparent);
  box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(26px) saturate(1.5);
  -webkit-backdrop-filter: blur(26px) saturate(1.5);
}

.android-update-sheet > div:first-child {
  display: none;
}

.android-update-sheet button {
  min-height: 48px;
  border-radius: 16px;
  box-shadow: none;
  background-image: none;
}

.android-update-sheet button:last-child {
  background-color: var(--accent, #fa2d48);
}

/* 动画 */
.update-modal-enter-active,
.update-modal-leave-active {
  transition: opacity 0.3s ease;
}

.update-modal-enter-from,
.update-modal-leave-to {
  opacity: 0;
}

.update-modal-enter-active .animate-slide-up,
.update-modal-leave-active .animate-slide-up {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.update-modal-enter-from .animate-slide-up {
  transform: translateY(100%);
}

.update-modal-leave-to .animate-slide-up {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .update-modal-enter-active,
  .update-modal-leave-active,
  .update-modal-enter-active .animate-slide-up,
  .update-modal-leave-active .animate-slide-up {
    transition: none;
  }
}

/* 更新内容样式 */
:deep(h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

:deep(h2) {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

:deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

:deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
}

:deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
}

:deep(li) {
  margin-bottom: 0.25rem;
}

:deep(p) {
  margin-bottom: 0.5rem;
}

:deep(code) {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background-color: rgba(0, 0, 0, 0.05);
  font-size: 0.875rem;
}

:deep(a) {
  color: #22c55e;
}
</style>
