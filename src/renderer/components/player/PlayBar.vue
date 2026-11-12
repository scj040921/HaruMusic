<template>
  <div
    class="music-play-bar"
    :class="[
      setAnimationClass('animate__bounceInUp'),
      musicFullVisible ? 'play-bar-opcity' : '',
      musicFullVisible && MusicFullRef?.musicFullRef?.config?.hidePlayBar
        ? 'animate__animated animate__slideOutDown'
        : ''
    ]"
    :style="{
      color: musicFullVisible
        ? textColors.theme === 'dark'
          ? '#000000'
          : '#ffffff'
        : settingsStore.theme === 'dark'
          ? '#ffffff'
          : '#000000'
    }"
    @click="handleBarClick"
  >
    <div class="music-time custom-slider">
      <n-slider
        v-model:value="timeSlider"
        :step="1"
        :max="allTime"
        :min="0"
        :format-tooltip="formatTooltip"
        :show-tooltip="showSliderTooltip"
        @mouseenter="showSliderTooltip = true"
        @mouseleave="showSliderTooltip = false"
        @dragstart="handleSliderDragStart"
        @dragend="handleSliderDragEnd"
      ></n-slider>
    </div>
    <!-- 播放条空白区域点击进入详情页，由根节点的 handleBarClick 统一处理（#751） -->
    <div class="play-bar-img-wrapper">
      <n-image
        :src="getImgUrl(playMusic?.picUrl, '100y100')"
        class="play-bar-img"
        lazy
        preview-disabled
      />
      <div v-if="playMusic?.playLoading" class="loading-overlay">
        <i class="ri-loader-4-line loading-icon"></i>
      </div>
      <div class="hover-arrow">
        <div class="hover-content">
          <!-- <i class="ri-arrow-up-s-line text-3xl" :class="{ 'ri-arrow-down-s-line': musicFullVisible }"></i> -->
          <i
            class="text-3xl"
            :class="musicFullVisible ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'"
          ></i>
          <span class="hover-text">{{
            musicFullVisible ? t('player.playBar.collapse') : t('player.playBar.expand')
          }}</span>
        </div>
      </div>
    </div>
    <div class="music-content">
      <div class="music-content-title flex items-center">
        <n-ellipsis class="text-ellipsis" line-clamp="1">
          <p v-html="playMusic?.name || ''"></p>
        </n-ellipsis>
        <span v-if="playbackRate !== 1.0" class="playback-rate-badge"> {{ playbackRate }}x </span>
      </div>
      <div class="music-content-name">
        <n-ellipsis
          class="text-ellipsis"
          line-clamp="1"
          :tooltip="{
            contentStyle: { maxWidth: '600px' },
            zIndex: 99999
          }"
        >
          <span
            v-for="(artists, artistsindex) in artistList"
            :key="artistsindex"
            class="cursor-pointer hover:text-green-500"
            @click.stop="handleArtistClick(artists.id)"
          >
            {{ artists.name }}{{ artistsindex < artistList.length - 1 ? ' / ' : '' }}
          </span>
        </n-ellipsis>
      </div>
    </div>
    <div class="music-buttons">
      <button type="button" class="music-buttons-prev" aria-label="上一首" @click="handlePrev">
        <i class="iconfont icon-prev"></i>
      </button>
      <button
        type="button"
        class="music-buttons-play"
        aria-label="播放或暂停"
        @click="playMusicEvent"
      >
        <i class="iconfont icon" :class="play ? 'icon-stop' : 'icon-play'"></i>
      </button>
      <button type="button" class="music-buttons-next" aria-label="下一首" @click="handleNext">
        <i class="iconfont icon-next"></i>
      </button>
    </div>
    <div v-if="!liquid" class="audio-button">
      <div class="audio-volume custom-slider" @wheel.prevent="handleVolumeWheel">
        <div class="volume-icon" @click="mute">
          <i class="iconfont" :class="getVolumeIcon"></i>
        </div>
        <div class="volume-slider">
          <div class="volume-percentage" :class="{ 'volume-percentage-disabled': isMuted }">
            {{ Math.round(volumeSlider) }}%
          </div>
          <n-slider
            v-model:value="volumeSlider"
            :step="0.01"
            :tooltip="false"
            :disabled="isMuted"
            vertical
          ></n-slider>
        </div>
      </div>
      <n-tooltip v-if="!isMobile" trigger="hover" :z-index="9999999">
        <template #trigger>
          <i
            class="iconfont"
            :class="[playModeIcon, { 'intelligence-active': playMode === 3 }]"
            @click="togglePlayMode"
          ></i>
        </template>
        {{ playModeText }}
      </n-tooltip>
      <n-tooltip v-if="!isMobile" trigger="hover" :z-index="9999999">
        <template #trigger>
          <i
            class="iconfont"
            :class="{
              'like-active': isFavorite,
              'ri-heart-3-fill': isFavorite,
              'ri-heart-3-line': !isFavorite
            }"
            @click="toggleFavorite"
          ></i>
        </template>
        {{ t('player.playBar.like') }}
      </n-tooltip>
      <n-tooltip v-if="isElectron" class="music-lyric" trigger="hover" :z-index="9999999">
        <template #trigger>
          <i
            class="iconfont ri-netease-cloud-music-line"
            :class="{ 'text-green-500': isLyricWindowOpen, 'disabled-icon': !playMusic?.id }"
            @click="playMusic?.id && openLyricWindow()"
          ></i>
        </template>
        {{ playMusic?.id ? t('player.playBar.lyric') : t('player.playBar.noSongPlaying') }}
      </n-tooltip>
      <n-tooltip v-if="playMusic?.id && isElectron" trigger="hover" :z-index="9999999">
        <template #trigger>
          <reparse-popover v-if="playMusic?.id" />
        </template>
        {{ t('player.playBar.reparse') }}
      </n-tooltip>
      <n-tooltip v-if="playMusic?.id && isElectron" trigger="hover" :z-index="9999999">
        <template #trigger>
          <i
            class="iconfont ri-download-line"
            :class="{ 'disabled-icon': isDownloading }"
            @click="playMusic?.id && handleDownload()"
          />
        </template>
        {{ isDownloading ? t('songItem.message.downloading') : t('player.playBar.download') }}
      </n-tooltip>

      <song-quality-control :song="playMusic" />

      <!-- 高级控制菜单按钮（整合了 EQ、定时关闭、播放速度） -->
      <advanced-controls-popover />

      <n-tooltip trigger="hover" :z-index="9999999">
        <template #trigger>
          <i
            class="iconfont icon-list text-2xl hover:text-green-500 transition-colors cursor-pointer"
            @click="openPlayListDrawer"
          ></i>
        </template>
        {{ t('player.playBar.playList') }}
      </n-tooltip>
    </div>
    <div v-if="liquid" class="liquid-controls" @click.stop>
      <button
        type="button"
        :aria-label="t('player.playBar.like')"
        :aria-pressed="isFavorite"
        @click="toggleFavorite"
      >
        <i :class="isFavorite ? 'ri-heart-3-fill' : 'ri-heart-3-line'" />
      </button>
      <button type="button" :aria-label="t('player.playBar.playList')" @click="openPlayListDrawer">
        <i class="ri-play-list-2-line" />
      </button>
      <advanced-controls-popover />
      <n-popover trigger="click" placement="top-end" :z-index="10000" display-directive="show">
        <template #trigger
          ><button type="button" aria-label="音量与更多播放控制">
            <i class="ri-more-2-fill" /></button
        ></template>
        <div class="liquid-more">
          <label
            >音量
            <input aria-label="音量" type="range" min="0" max="100" v-model.number="volumeSlider"
          /></label>
          <div class="audio-button">
            <div class="audio-volume custom-slider" @wheel.prevent="handleVolumeWheel">
              <div class="volume-icon" @click="mute">
                <i class="iconfont" :class="getVolumeIcon"></i>
              </div>
              <div class="volume-slider">
                <div class="volume-percentage" :class="{ 'volume-percentage-disabled': isMuted }">
                  {{ Math.round(volumeSlider) }}%
                </div>
                <n-slider
                  v-model:value="volumeSlider"
                  :step="0.01"
                  :tooltip="false"
                  :disabled="isMuted"
                  vertical
                ></n-slider>
              </div>
            </div>
            <n-tooltip v-if="!isMobile" trigger="hover" :z-index="9999999">
              <template #trigger>
                <i
                  class="iconfont"
                  :class="[playModeIcon, { 'intelligence-active': playMode === 3 }]"
                  @click="togglePlayMode"
                ></i>
              </template>
              {{ playModeText }}
            </n-tooltip>
            <n-tooltip v-if="!isMobile" trigger="hover" :z-index="9999999">
              <template #trigger>
                <i
                  class="iconfont"
                  :class="{
                    'like-active': isFavorite,
                    'ri-heart-3-fill': isFavorite,
                    'ri-heart-3-line': !isFavorite
                  }"
                  @click="toggleFavorite"
                ></i>
              </template>
              {{ t('player.playBar.like') }}
            </n-tooltip>
            <n-tooltip v-if="isElectron" class="music-lyric" trigger="hover" :z-index="9999999">
              <template #trigger>
                <i
                  class="iconfont ri-netease-cloud-music-line"
                  :class="{ 'text-green-500': isLyricWindowOpen, 'disabled-icon': !playMusic?.id }"
                  @click="playMusic?.id && openLyricWindow()"
                ></i>
              </template>
              {{ playMusic?.id ? t('player.playBar.lyric') : t('player.playBar.noSongPlaying') }}
            </n-tooltip>
            <n-tooltip v-if="playMusic?.id && isElectron" trigger="hover" :z-index="9999999">
              <template #trigger>
                <reparse-popover v-if="playMusic?.id" />
              </template>
              {{ t('player.playBar.reparse') }}
            </n-tooltip>
            <n-tooltip v-if="playMusic?.id && isElectron" trigger="hover" :z-index="9999999">
              <template #trigger>
                <i
                  class="iconfont ri-download-line"
                  :class="{ 'disabled-icon': isDownloading }"
                  @click="playMusic?.id && handleDownload()"
                />
              </template>
              {{ isDownloading ? t('songItem.message.downloading') : t('player.playBar.download') }}
            </n-tooltip>

            <song-quality-control :song="playMusic" />

            <!-- 高级控制菜单按钮（整合了 EQ、定时关闭、播放速度） -->

            <n-tooltip trigger="hover" :z-index="9999999">
              <template #trigger>
                <i
                  class="iconfont icon-list text-2xl hover:text-green-500 transition-colors cursor-pointer"
                  @click="openPlayListDrawer"
                ></i>
              </template>
              {{ t('player.playBar.playList') }}
            </n-tooltip>
          </div>
        </div>
      </n-popover>
    </div>
    <!-- 全屏播放器 -->
    <music-full-wrapper
      ref="MusicFullRef"
      v-model="musicFullVisible"
      :background="background"
      :liquid="liquid"
    />
  </div>
</template>

<script lang="ts" setup>
import { useThrottleFn } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import MusicFullWrapper from '@/components/lyric/MusicFullWrapper.vue';
import AdvancedControlsPopover from '@/components/player/AdvancedControlsPopover.vue';
import ReparsePopover from '@/components/player/ReparsePopover.vue';
import SongQualityControl from '@/components/player/SongQualityControl.vue';
import {
  allTime,
  artistList,
  isLyricWindowOpen,
  nowTime,
  openLyric,
  playMusic,
  textColors
} from '@/hooks/MusicHook';
import { useArtist } from '@/hooks/useArtist';
import { useDownload } from '@/hooks/useDownload';
import { useFavorite } from '@/hooks/useFavorite';
import { usePlaybackControl } from '@/hooks/usePlaybackControl';
import { usePlayMode } from '@/hooks/usePlayMode';
import { useVolumeControl } from '@/hooks/useVolumeControl';
import { audioService } from '@/services/audioService';
import { usePlayerStore } from '@/store/modules/player';
import { useSettingsStore } from '@/store/modules/settings';
import { getImgUrl, isElectron, isMobile, secondToMinute, setAnimationClass } from '@/utils';

defineProps<{ liquid?: boolean }>();

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const { t } = useI18n();

// 播放控制
const { isPlaying: play, playMusicEvent, handleNext, handlePrev } = usePlaybackControl();

// 音量控制
const {
  isMuted,
  volumeSlider,
  volumeIcon: getVolumeIcon,
  mute,
  handleVolumeWheel
} = useVolumeControl();

// 收藏
const { isFavorite, toggleFavorite } = useFavorite();

// 下载
const { downloadMusic, isDownloading } = useDownload();
const handleDownload = () => {
  if (!playMusic.value || isDownloading.value) return;
  downloadMusic(playMusic.value);
};

// 播放模式
const { playMode, playModeIcon, playModeText, togglePlayMode } = usePlayMode();

// 播放速度控制
const { playbackRate } = storeToRefs(playerStore);

// 背景颜色
const background = ref('#000');

watch(
  () => playerStore.playMusic,
  async () => {
    if (playMusic && playMusic.value && playMusic.value.backgroundColor) {
      background.value = playMusic.value.backgroundColor as string;
    }
  },
  { immediate: true, deep: true }
);

// 节流版本的 seek 函数
const throttledSeek = useThrottleFn((value: number) => {
  audioService.seek(value);
  nowTime.value = value;
}, 50);

// 拖动时的临时值
const dragValue = ref(0);
const isDragging = ref(false);

const timeSlider = computed({
  get: () => (isDragging.value ? dragValue.value : nowTime.value),
  set: (value) => {
    if (isDragging.value) {
      dragValue.value = value;
      return;
    }
    throttledSeek(value);
  }
});

const handleSliderDragStart = () => {
  isDragging.value = true;
  dragValue.value = nowTime.value;
};

const handleSliderDragEnd = () => {
  isDragging.value = false;
  audioService.seek(dragValue.value);
  nowTime.value = dragValue.value;
};

const formatTooltip = (value: number) => {
  return `${secondToMinute(value)} / ${secondToMinute(allTime.value)}`;
};

const MusicFullRef = ref<any>(null);
const showSliderTooltip = ref(false);

const musicFullVisible = computed({
  get: () => playerStore.musicFull,
  set: (value) => {
    playerStore.setMusicFull(value);
  }
});

const setMusicFull = () => {
  musicFullVisible.value = !musicFullVisible.value;
  playerStore.setMusicFull(musicFullVisible.value);
  if (musicFullVisible.value) {
    settingsStore.showArtistDrawer = false;
  }
};

/**
 * 点击底部播放条的任意空白区域都能进入（退出）详情页（#751）
 * 只排除真正的交互控件，其余位置（封面、歌曲信息、按钮之间的空白）都可点击。
 * 全屏播放器由 n-drawer teleport 到 #layout-main，不在播放条节点内，无需额外排除。
 */
const IGNORE_FULL_TRIGGER_SELECTOR = [
  '.liquid-controls',
  '.music-time', // 进度条（绝对定位覆盖播放条顶边）
  '.music-buttons-prev',
  '.music-buttons-play',
  '.music-buttons-next',
  '.audio-button' // 音量、播放模式、收藏、歌词、下载、更多、播放列表
].join(', ');

const handleBarClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(IGNORE_FULL_TRIGGER_SELECTOR)) return;
  setMusicFull();
};

const openLyricWindow = async () => {
  await openLyric();
};

const { navigateToArtist } = useArtist();

const handleArtistClick = (id: number) => {
  musicFullVisible.value = false;
  navigateToArtist(id);
};

const openPlayListDrawer = () => {
  playerStore.setPlayListDrawerVisible(true);
};
</script>

<style lang="scss" scoped>
.liquid-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}
.liquid-controls button {
  width: 36px;
  height: 44px;
  font-size: 20px;
  cursor: pointer;
  border-radius: 14px;
}
.liquid-controls button[aria-pressed='true'] {
  color: #ed536a;
}
.liquid-more {
  max-width: min(600px, 80vw);
  padding: 12px;
}
.liquid-more label {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
}
.liquid-more input {
  flex: 1;
}
.liquid-more .audio-button {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.music-buttons button:focus-visible,
.liquid-controls button:focus-visible {
  outline: 2px solid #ed536a;
  outline-offset: 2px;
}

.music-buttons-play {
  transition:
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms ease;
}
.music-buttons-play:active {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .music-buttons-play {
    transition: none;
  }
  .music-buttons-play:active {
    transform: none;
  }
  .music-play-bar {
    animation: none !important;
  }
}
.text-ellipsis {
  width: 100%;
}

.music-play-bar {
  position: fixed;
  left: calc(var(--content-sidebar-width, 0px) + (100vw - var(--content-sidebar-width, 0px)) / 2);
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(1120px, calc(100vw - var(--content-sidebar-width, 0px) - 40px));
  height: 80px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding: 10px 20px 12px;
  background: var(--background, #f7f8f6);
  border: 1px solid var(--stroke, #d8ddd7);
  border-radius: var(--corner, 16px);
  box-shadow: 0 8px 28px rgba(22, 31, 26, 0.14);
  z-index: 9999;
  animation: none !important;
  /* 空白区域可点击展开详情页（#751） */
  cursor: pointer;

  .music-time {
    cursor: default;
  }

  &.play-bar-opcity {
    @apply bg-transparent !important;
    box-shadow: 0 0 20px 5px #0000001d;
  }

  &.animate__slideOutDown {
    animation-duration: 0.3s !important;
    pointer-events: none;
  }

  .music-content {
    width: clamp(140px, 18vw, 240px);
    min-width: 0;
    @apply ml-4;

    &-title {
      @apply text-base;
    }

    &-name {
      @apply text-xs mt-1 opacity-80;
    }
  }
}

.play-bar-img {
  @apply w-12 h-12;
  border-radius: var(--corner, 16px);
}

.music-buttons {
  @apply mx-6 flex-1 flex justify-center;
  min-width: 170px;

  .iconfont {
    @apply text-2xl transition;
    @apply hover:text-green-500;
  }

  .icon {
    @apply text-3xl;
    @apply hover:text-green-500;
  }

  @apply flex items-center;

  > button {
    @apply cursor-pointer;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--corner, 16px);
    color: var(--text, #20231f);
  }

  &-play {
    @apply flex justify-center items-center mx-2;
    color: var(--highlight, #315f55) !important;
    background: transparent;
    .icon {
      font-size: 30px;
    }
  }
}

@media (max-width: 1100px) {
  .music-play-bar {
    padding-left: 16px;
    padding-right: 16px;
  }
  .music-buttons {
    margin-left: 12px;
    margin-right: 12px;
  }
  .music-buttons-play {
    margin-left: 8px;
    margin-right: 8px;
  }
  .audio-button .iconfont {
    margin-left: 5px;
    margin-right: 5px;
  }
}
:global(.dark) .music-play-bar {
  background: var(--background, #171b18);
  border-color: var(--stroke, #343a35);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.34);
}

.music-play-bar :deep(button:focus-visible),
.music-play-bar :deep(.iconfont:focus-visible) {
  outline: 2px solid var(--highlight, #315f55);
  outline-offset: 2px;
}

.audio-volume {
  @apply flex items-center relative;
  &:hover {
    .volume-slider {
      @apply opacity-100 visible;
    }
  }
  .volume-icon {
    @apply cursor-pointer;
  }

  .iconfont {
    @apply text-2xl transition;
    @apply hover:text-green-500;
  }

  .volume-slider {
    @apply absolute opacity-0 invisible transition-all duration-300 bottom-[30px] left-1/2 -translate-x-1/2 h-[180px] px-2 py-4 rounded-xl;
    @apply bg-light dark:bg-dark-200;
    @apply border border-gray-200 dark:border-gray-700;

    .volume-percentage {
      @apply absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium bg-light dark:bg-dark-200 px-2 py-1 rounded-md;
      @apply border border-gray-200 dark:border-gray-700;
      @apply text-gray-800 dark:text-white;
      white-space: nowrap;

      &.volume-percentage-disabled {
        @apply text-gray-400 dark:text-gray-500;
      }
    }
  }
}

.audio-button {
  @apply flex items-center;
  gap: 4px;

  .iconfont {
    @apply text-xl transition cursor-pointer;
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--corner, 16px);
    @apply hover:text-green-500;
  }
}

.music-play {
  &-list {
    height: 50vh;
    width: 300px;
    @apply relative rounded-3xl overflow-hidden py-2;
    &-back {
      backdrop-filter: blur(20px);
      @apply absolute top-0 left-0 w-full h-full;
      @apply bg-light dark:bg-black bg-opacity-75;
    }
    &-content {
      @apply mx-2;
    }
  }
}

.mobile {
  .music-play-bar {
    @apply px-4 bottom-[56px] transition-all duration-300;
  }
  .music-time {
    display: none;
  }
  .ri-netease-cloud-music-line {
    display: none;
  }
  .audio-volume {
    display: none;
  }
  .audio-button {
    @apply mx-0;
  }
  .music-buttons {
    @apply m-0;
    &-prev,
    &-next {
      display: none;
    }
    &-play {
      @apply m-0;
    }
  }
  .music-content {
    flex: 1;
  }
}

// 自定义滑块样式
.custom-slider {
  :deep(.n-slider) {
    --n-rail-height: 4px;
    --n-rail-color: theme('colors.gray.200');
    --n-rail-color-dark: theme('colors.gray.700');
    --n-fill-color: theme('colors.green.500');
    --n-handle-size: 12px;
    --n-handle-color: theme('colors.green.500');

    &.n-slider--vertical {
      height: 100%;

      .n-slider-rail {
        width: 4px;
      }

      &:hover {
        .n-slider-rail {
          width: 6px;
        }

        .n-slider-handle {
          width: 14px;
          height: 14px;
        }
      }
    }

    .n-slider-rail {
      @apply overflow-hidden transition-all duration-200;
      @apply bg-gray-500 dark:bg-dark-300 bg-opacity-10 !important;
    }

    .n-slider-handle {
      @apply transition-all duration-200;
      opacity: 0;
    }

    &:hover {
      .n-slider-handle {
        opacity: 1;
      }
    }

    // 确保悬停时提示样式正确
    .n-slider-tooltip {
      @apply bg-dark-200 text-white text-xs py-1 px-2 rounded;
      z-index: 999999;
    }
  }
}

.play-bar-img-wrapper {
  @apply relative cursor-pointer w-14 h-14;

  .hover-arrow {
    @apply absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 rounded-2xl;
    background: rgba(0, 0, 0, 0.5);

    .hover-content {
      @apply flex flex-col items-center justify-center;

      i {
        @apply text-white mb-0.5;
      }

      .hover-text {
        @apply text-white text-xs scale-90;
      }
    }
  }

  &:hover {
    .hover-arrow {
      @apply opacity-100;
    }
  }
}

.tooltip-content {
  @apply text-sm py-1 px-2;
}

.play-bar-img {
  @apply w-14 h-14 rounded-xl;
}

.like-active {
  @apply text-red-500 hover:text-red-600 !important;
}

.intelligence-active {
  @apply text-green-500 hover:text-green-600 !important;
}

.disabled-icon {
  @apply opacity-50 cursor-not-allowed !important;
  &:hover {
    @apply text-inherit !important;
  }
}

.icon-loop,
.icon-single-loop {
  font-size: 1.5rem;
}

.music-time .n-slider {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0;
  border-radius: 0;
}

@media (max-width: 760px) {
  .music-play-bar {
    left: 50%;
    width: calc(100vw - 24px);
    bottom: max(10px, env(safe-area-inset-bottom));
    height: 72px;
    padding-inline: 12px;
  }
  .music-play-bar .music-content {
    width: auto;
    flex: 1;
    margin-left: 10px;
  }
  .music-play-bar .music-buttons {
    flex: none;
    min-width: auto;
    margin-inline: 8px;
  }
  .music-play-bar .audio-button {
    gap: 0;
  }
  .music-play-bar .audio-button > *:not(:last-child) {
    display: none;
  }
}

.music-eq {
  @apply p-4 rounded-3xl;
  backdrop-filter: blur(20px);
  @apply bg-light dark:bg-black bg-opacity-75;
}

.music-play-list-content {
  @apply mx-2;

  .delete-btn {
    @apply p-2 rounded-full transition-colors duration-200 cursor-pointer;
    @apply hover:bg-red-50 dark:hover:bg-red-900/20;

    .iconfont {
      @apply text-lg;
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-overlay {
  @apply absolute inset-0 flex items-center justify-center rounded-2xl;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 2;
}

.loading-icon {
  font-size: 24px;
  color: white;
  animation: spin 1s linear infinite;
}

.play-speed {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 8px;
}

.speed-button {
  font-size: 14px;
  color: var(--text-color);
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--hover-color);
}

.speed-button:hover {
  background: var(--hover-color-dark);
}

.playback-rate-badge {
  @apply ml-2 px-1.5 h-4 flex items-center text-xs rounded bg-green-500 bg-opacity-15 text-green-600 dark:text-green-400;
  font-weight: 500;
  vertical-align: 1px;
}
</style>
