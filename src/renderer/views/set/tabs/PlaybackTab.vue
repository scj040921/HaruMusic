<template>
  <div>
    <setting-section :title="t('settings.sections.playback')">
      <setting-item
        :title="t('settings.playback.quality')"
        :description="t('settings.playback.qualityDesc')"
      >
        <s-select
          v-model="setData.musicQuality"
          :options="qualityOptions"
          width="w-40 max-md:w-full"
        />
      </setting-item>

      <setting-item :title="t('settings.playback.musicSources')">
        <template #description>
          <div class="mt-1 text-sm">
            <span class="text-gray-500">{{ t('settings.playback.selectedMusicSources') }}</span>
            <span v-if="musicSources.length > 0" class="text-gray-400">{{
              musicSources.join(', ')
            }}</span>
            <span v-else class="text-red-500 text-xs">{{
              t('settings.playback.noMusicSources')
            }}</span>
          </div>
        </template>
        <s-btn @click="showMusicSourcesModal = true">
          {{ t('settings.playback.configureMusicSources') }}
        </s-btn>
      </setting-item>

      <setting-item
        v-if="platform === 'darwin'"
        :title="t('settings.playback.showStatusBar')"
        :description="t('settings.playback.showStatusBarContent')"
      >
        <n-switch v-model:value="setData.showTopAction">
          <template #checked>{{ t('common.on') }}</template>
          <template #unchecked>{{ t('common.off') }}</template>
        </n-switch>
      </setting-item>

      <setting-item
        :title="t('settings.playback.autoPlay')"
        :description="t('settings.playback.autoPlayDesc')"
      >
        <n-switch v-model:value="setData.autoPlay">
          <template #checked>{{ t('common.on') }}</template>
          <template #unchecked>{{ t('common.off') }}</template>
        </n-switch>
      </setting-item>

      <setting-item :title="t('settings.playback.singleSongPlayMode')">
        <s-select
          v-model="setData.singleSongPlayMode"
          :options="singleSongPlayModeOptions"
          width="w-64 max-md:w-full"
        />
      </setting-item>

      <!-- 纯净模式常驻开关：为播放页的隐式悬停唤出提供显式退出入口（#758） -->
      <setting-item
        :title="t('settings.playback.pureMode')"
        :description="t('settings.playback.pureModeDesc')"
      >
        <n-switch v-model:value="pureModeEnabled">
          <template #checked>{{ t('common.on') }}</template>
          <template #unchecked>{{ t('common.off') }}</template>
        </n-switch>
      </setting-item>

      <setting-item
        v-if="isElectron"
        :title="t('settings.playback.audioDevice')"
        :description="t('settings.playback.audioDeviceDesc')"
      >
        <audio-device-settings />
      </setting-item>
    </setting-section>

    <setting-section title="Salt UI 播放界面">
      <setting-item title="播放界面主题" description="跟随系统，或单独指定浅色与深色播放界面。">
        <s-select
          v-model="saltConfig.saltPlayerTheme"
          :options="saltThemeOptions"
          width="w-40 max-md:w-full"
          @update:value="saveSaltConfig"
        />
      </setting-item>
      <setting-item title="分控主题" description="允许主页与播放界面分别使用强调色。">
        <n-switch v-model:value="saltConfig.saltSplitTheme" @update:value="saveSaltConfig" />
        <div v-if="saltConfig.saltSplitTheme" class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm"
            >主页
            <input
              v-model="saltConfig.saltHomeHighlight"
              type="color"
              aria-label="主页强调色"
              @input="saveSaltConfig"
          /></label>
          <label class="flex items-center gap-2 text-sm"
            >播放页
            <input
              v-model="saltConfig.saltPlayerHighlight"
              type="color"
              aria-label="播放页强调色"
              @input="saveSaltConfig"
          /></label>
        </div>
      </setting-item>
      <setting-item title="壁纸取色" description="从当前专辑封面采样播放背景色。">
        <n-switch v-model:value="saltConfig.saltSampleWallpaper" @update:value="saveSaltConfig" />
      </setting-item>
      <setting-item
        title="动态流光"
        description="浅色主题自动降低流光强度；关闭后保留静态采样背景。"
      >
        <n-switch v-model:value="saltConfig.saltDynamicFlow" @update:value="saveSaltConfig" />
      </setting-item>
      <setting-item
        title="长按播放键切换沉浸模式"
        description="隐藏歌曲信息与状态栏，只保留封面或歌词和基本操控。"
      >
        <n-switch v-model:value="saltConfig.saltImmersiveOnHold" @update:value="saveSaltConfig" />
      </setting-item>
      <setting-item
        title="歌词逐字策略"
        description="只强调当前行、扩展到相邻行，或始终按时间揭示。"
      >
        <s-select
          v-model="saltConfig.saltKaraokePolicy"
          :options="saltKaraokeOptions"
          width="w-48 max-md:w-full"
          @update:value="saveSaltConfig"
        />
      </setting-item>
      <setting-item
        title="逐字动画帧率"
        description="逐字进度由播放音频时钟驱动，并按所选帧率量化显示。"
      >
        <div class="flex items-center gap-3">
          <input
            v-model.number="saltConfig.saltKaraokeFps"
            type="range"
            min="10"
            max="60"
            step="5"
            @input="saveSaltConfig"
          /><span>{{ saltConfig.saltKaraokeFps }} fps</span>
        </div>
      </setting-item>
      <setting-item title="未播放歌词透明度" description="设置逐字揭示前歌词的可见程度。">
        <div class="flex items-center gap-3">
          <input
            v-model.number="saltConfig.saltKaraokeOpacity"
            type="range"
            min="20"
            max="80"
            step="5"
            @input="saveSaltConfig"
          /><span>{{ saltConfig.saltKaraokeOpacity }}%</span>
        </div>
      </setting-item>
      <setting-item title="桌面歌词" description="记住桌面歌词偏好。">
        <n-switch
          v-model:value="saltConfig.saltDesktopLyrics"
          :disabled="!isElectron"
          @update:value="setDesktopLyrics"
        />
      </setting-item>
      <setting-item
        title="状态栏歌词置顶"
        description="桌面歌词窗口打开时，将歌词窗口保持在其他窗口上方。"
      >
        <n-switch
          v-model:value="saltConfig.saltStatusLyrics"
          :disabled="!isElectron"
          @update:value="setStatusLyrics"
        />
      </setting-item>
      <setting-item
        title="保持屏幕唤醒"
        description="播放界面打开时阻止屏幕自动休眠；设备不支持时自动忽略。"
      >
        <n-switch v-model:value="saltConfig.saltKeepAwake" @update:value="saveSaltConfig" />
      </setting-item>
    </setting-section>

    <div
      class="mt-6 p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-100 dark:border-gray-800"
    >
      <div class="text-sm font-medium text-gray-500 mb-3">支持正版</div>
      <div class="text-base text-gray-900 dark:text-white mb-4">
        大家还是需要支持正版，本软件只做开源探讨。各大音乐会员购买链接：
      </div>
      <div class="flex gap-3 flex-wrap">
        <a
          v-for="link in memberLinks"
          :key="link.url"
          class="px-4 py-2 rounded-xl bg-gray-50 dark:bg-black/20 text-primary hover:text-green-500 transition-colors"
          :href="link.url"
          target="_blank"
        >
          {{ link.name }} <i class="ri-external-link-line ml-1"></i>
        </a>
      </div>
    </div>

    <music-source-settings v-model:show="showMusicSourcesModal" v-model:sources="musicSources" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import AudioDeviceSettings from '@/components/settings/AudioDeviceSettings.vue';
import MusicSourceSettings from '@/components/settings/MusicSourceSettings.vue';
import { isLyricWindowOpen, openLyric } from '@/hooks/MusicHook';
import { type Platform } from '@/types/music';
import { isElectron } from '@/utils';
import { LYRIC_CONFIG_CHANGE_EVENT, readLyricConfig, writeLyricConfig } from '@/utils/lyricConfig';

import { SETTINGS_DATA_KEY } from '../keys';
import SBtn from '../SBtn.vue';
import SettingItem from '../SettingItem.vue';
import SettingSection from '../SettingSection.vue';
import SSelect from '../SSelect.vue';

const ALL_PLATFORMS: Platform[] = ['netease' as Platform];

const memberLinks = [
  { name: '网易云音乐会员', url: 'https://music.163.com/store/vip' },
  { name: 'QQ音乐会员', url: 'https://y.qq.com/portal/vipportal/' },
  { name: '酷狗音乐会员', url: 'https://vip.kugou.com/' }
];

const { t } = useI18n();
const setData = inject(SETTINGS_DATA_KEY)!;
const platform = window.electron ? window.electron.ipcRenderer.sendSync('get-platform') : 'web';

const showMusicSourcesModal = ref(false);

// 纯净模式开关：与播放页共享 localStorage 配置，通过自定义事件双向实时同步
const pureModeEnabled = ref(readLyricConfig().pureModeEnabled);
const saltConfig = ref(readLyricConfig());
const saltThemeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
];
const saltKaraokeOptions = [
  { label: '仅当前行逐字', value: 'current' },
  { label: '拓展当前行逐字', value: 'expanded' },
  { label: '总是逐字', value: 'always' }
];
const saveSaltConfig = () => writeLyricConfig({ ...readLyricConfig(), ...saltConfig.value });
const setDesktopLyrics = async (enabled: boolean) => {
  saveSaltConfig();
  if (isElectron && enabled !== isLyricWindowOpen.value) await openLyric();
};
const setStatusLyrics = (enabled: boolean) => {
  saveSaltConfig();
  if (isElectron && isLyricWindowOpen.value) {
    window.electron.ipcRenderer.send('top-lyric', enabled);
  }
};

const handleLyricConfigChange = () => {
  saltConfig.value = readLyricConfig();
  pureModeEnabled.value = saltConfig.value.pureModeEnabled;
};

onMounted(() => {
  window.addEventListener(LYRIC_CONFIG_CHANGE_EVENT, handleLyricConfigChange);
});

onBeforeUnmount(() => {
  window.removeEventListener(LYRIC_CONFIG_CHANGE_EVENT, handleLyricConfigChange);
});

watch(pureModeEnabled, (value) => {
  writeLyricConfig({ ...readLyricConfig(), pureModeEnabled: value });
});

const qualityOptions = computed(() => [
  { label: t('settings.playback.qualityOptions.auto'), value: 'auto' },
  { label: t('settings.playback.qualityOptions.standard'), value: 'standard' },
  { label: t('settings.playback.qualityOptions.higher'), value: 'higher' },
  { label: t('settings.playback.qualityOptions.exhigh'), value: 'exhigh' },
  { label: t('settings.playback.qualityOptions.lossless'), value: 'lossless' },
  { label: t('settings.playback.qualityOptions.hires'), value: 'hires' },
  { label: t('settings.playback.qualityOptions.jyeffect'), value: 'jyeffect' },
  { label: t('settings.playback.qualityOptions.sky'), value: 'sky' },
  { label: t('settings.playback.qualityOptions.dolby'), value: 'dolby' },
  { label: t('settings.playback.qualityOptions.jymaster'), value: 'jymaster' }
]);

const singleSongPlayModeOptions = computed(() => [
  { label: t('settings.playback.singleSongPlayModeOptions.replace'), value: 'replace' },
  { label: t('settings.playback.singleSongPlayModeOptions.add'), value: 'add' }
]);

const musicSources = computed({
  get: () => {
    if (!setData.value.enabledMusicSources) return ALL_PLATFORMS;
    return setData.value.enabledMusicSources as Platform[];
  },
  set: (newValue: Platform[]) => {
    const valuesToSet = newValue.length > 0 ? [...new Set(newValue)] : ALL_PLATFORMS;
    setData.value = { ...setData.value, enabledMusicSources: valuesToSet };
  }
});
</script>
