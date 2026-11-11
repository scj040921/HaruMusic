<template>
  <div
    class="liquid-settings-page h-full w-full bg-white dark:bg-black transition-colors duration-500 flex flex-col"
  >
    <!-- 顶部导航区 -->
    <div
      class="liquid-settings-nav flex-shrink-0 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black z-10 page-padding pt-6 pb-2"
    >
      <h1 class="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-6">
        {{ t('common.settings') }}
      </h1>

      <n-scrollbar x-scrollable class="w-full">
        <div class="flex items-center pl-2 pb-2 whitespace-nowrap">
          <button
            v-for="section in navSections"
            :key="section.id"
            type="button"
            class="settings-tab"
            :class="{ 'settings-tab-active': currentSection === section.id }"
            :aria-pressed="currentSection === section.id"
            @click="currentSection = section.id"
          >
            {{ section.title }}
          </button>
        </div>
      </n-scrollbar>
    </div>

    <!-- 内容区域 -->
    <n-scrollbar class="flex-1">
      <div class="settings-content w-full mx-auto pb-32 pt-6 page-padding">
        <div v-show="currentSection === 'basic'" class="animate-fade-in">
          <basic-tab />
        </div>

        <div v-show="currentSection === 'playback'" class="animate-fade-in">
          <playback-tab />
        </div>

        <div v-show="currentSection === 'application'" class="animate-fade-in">
          <application-tab />
        </div>

        <div v-show="currentSection === 'network'" class="animate-fade-in">
          <network-tab />
        </div>

        <div v-show="currentSection === 'system'" class="animate-fade-in">
          <system-tab />
        </div>

        <div v-show="currentSection === 'about'" class="animate-fade-in">
          <about-tab />
        </div>

        <div class="h-20"></div>
        <play-bottom />
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import { useDialog, useMessage } from 'naive-ui';
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import PlayBottom from '@/components/common/PlayBottom.vue';
import { useSettingsStore } from '@/store/modules/settings';
import { isElectron } from '@/utils';

import config from '../../../../package.json';
import { createDefaultAppUpdateState } from '../../../shared/appUpdate';
import { SETTINGS_DATA_KEY, SETTINGS_DIALOG_KEY, SETTINGS_MESSAGE_KEY } from './keys';
import AboutTab from './tabs/AboutTab.vue';
import ApplicationTab from './tabs/ApplicationTab.vue';
import BasicTab from './tabs/BasicTab.vue';
import NetworkTab from './tabs/NetworkTab.vue';
import PlaybackTab from './tabs/PlaybackTab.vue';
import SystemTab from './tabs/SystemTab.vue';

const settingsStore = useSettingsStore();
const message = useMessage();
const dialog = useDialog();
const { t } = useI18n();

// ==================== 设置数据管理 ====================
const saveSettings = useDebounceFn((data) => {
  settingsStore.setSetData(data);
}, 500);

const localSetData = ref({ ...settingsStore.setData });

const setData = computed({
  get: () => localSetData.value,
  set: (newData) => {
    localSetData.value = newData;
  }
});

watch(
  () => localSetData.value,
  (newValue) => saveSettings(newValue),
  { deep: true }
);

watch(
  () => settingsStore.setData,
  (newValue) => {
    if (JSON.stringify(localSetData.value) !== JSON.stringify(newValue)) {
      localSetData.value = { ...newValue };
    }
  },
  { deep: true, immediate: true }
);

onUnmounted(() => {
  settingsStore.setSetData(localSetData.value);
});

// ==================== Provide ====================
provide(SETTINGS_DATA_KEY, setData);
provide(SETTINGS_MESSAGE_KEY, message);
provide(SETTINGS_DIALOG_KEY, dialog);

// ==================== 导航相关 ====================
type SettingSectionConfig = {
  id: string;
  electron?: boolean;
};

const settingSections: SettingSectionConfig[] = [
  { id: 'basic' },
  { id: 'playback' },
  { id: 'application', electron: true },
  { id: 'network', electron: true },
  { id: 'system', electron: true },
  { id: 'about' }
];

const navSections = computed(() => {
  return settingSections
    .filter((section) => !section.electron || isElectron)
    .map((section) => ({
      id: section.id,
      title: t(`settings.sections.${section.id}`)
    }));
});

const currentSection = ref('basic');

// ==================== 初始化 ====================
onMounted(() => {
  if (isElectron && settingsStore.appUpdateState.currentVersion === '') {
    settingsStore.setAppUpdateState(createDefaultAppUpdateState(config.version));
  }
  if (setData.value.proxyConfig) {
    // proxy form init moved to NetworkTab
  }
  if (setData.value.enableRealIP === undefined) {
    setData.value = { ...setData.value, enableRealIP: false };
  }
  if (setData.value.enableDiskCache === undefined) {
    setData.value = { ...setData.value, enableDiskCache: true };
  }
  if (!setData.value.diskCacheMaxSizeMB) {
    setData.value = { ...setData.value, diskCacheMaxSizeMB: 4096 };
  }
  if (!['lru', 'fifo'].includes(setData.value.diskCacheCleanupPolicy)) {
    setData.value = { ...setData.value, diskCacheCleanupPolicy: 'lru' };
  }
});
</script>

<style scoped>
.settings-content {
  max-width: 1120px;
}
.settings-tab {
  position: relative;
  padding: 9px 14px 12px;
  border: 0;
  background: transparent;
  color: #63736c;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.settings-tab:hover {
  color: #315f55;
}
.settings-tab-active {
  color: #315f55;
}
.settings-tab-active::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 0;
  height: 2px;
  border-radius: 2px;
  background: #376d5e;
}
.settings-tab:focus-visible {
  outline: 2px solid #568f7c;
  outline-offset: -2px;
}
:global(.dark) .settings-tab {
  color: #a6b8b0;
}
:global(.dark) .settings-tab-active {
  color: #c5e2d5;
}

:deep(.n-select .n-base-selection) {
  border-radius: 10px;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
