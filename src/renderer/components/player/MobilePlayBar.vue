<template>
  <div
    ref="playBarRef"
    class="mobile-play-bar"
    :class="[
      setAnimationClass('animate__fadeInUp'),
      playerStore.musicFull ? 'play-bar-expanded' : 'play-bar-mini',
      shouldShowMobileMenu ? 'is-menu-show' : 'is-menu-hide',
      { 'android-native-player': isAndroidApp }
    ]"
    :style="{
      color: playerStore.musicFull
        ? textColors.theme === 'dark'
          ? '#ffffff'
          : '#ffffff'
        : settingsStore.theme === 'dark'
          ? '#ffffff'
          : '#000000'
    }"
  >
    <!-- Mini模式 - 在musicFullVisible为false时显示 -->
    <div v-if="!playerStore.musicFull" class="mobile-mini-controls">
      <!-- 歌曲信息 -->
      <button class="mini-song-info" type="button" aria-label="打开正在播放" @click="setMusicFull">
        <n-image
          v-if="playMusic?.picUrl"
          :src="getImgUrl(playMusic?.picUrl, '100y100')"
          class="mini-song-cover"
          lazy
          preview-disabled
        />
        <span v-else class="mini-song-cover mini-cover-placeholder"
          ><i class="ri-music-2-line"
        /></span>
        <div class="mini-song-text">
          <span class="mini-song-title">{{ playMusic.name }}</span>
          <span v-if="artistList.length" class="mini-song-artist">{{
            artistList.map((artist) => artist.name).join(' / ')
          }}</span>
        </div>
      </button>

      <div class="mini-playback-controls">
        <button
          class="mini-control-btn play"
          type="button"
          :aria-label="play ? '暂停' : '播放'"
          @click="playMusicEvent"
        >
          <i class="iconfont icon" :class="play ? 'icon-stop' : 'icon-play'"></i>
        </button>
        <button
          class="mini-list-icon"
          type="button"
          aria-label="播放队列"
          @click="openPlayListDrawer"
        >
          <i class="iconfont icon-list"></i>
        </button>
      </div>
    </div>

    <!-- 全屏播放器 -->
    <music-full-wrapper
      ref="MusicFullRef"
      v-model="playerStore.musicFull"
      :background="background"
    />
  </div>
</template>

<script lang="ts" setup>
import { useSwipe } from '@vueuse/core';
import type { Ref } from 'vue';
import { computed, inject, onMounted, ref, watch } from 'vue';

import MusicFullWrapper from '@/components/lyric/MusicFullWrapper.vue';
import { textColors } from '@/hooks/MusicHook';
import { usePlaybackControl } from '@/hooks/usePlaybackControl';
import { usePlayerStore } from '@/store/modules/player';
import { useSettingsStore } from '@/store/modules/settings';
import type { SongResult } from '@/types/music';
import { getImgUrl, isAndroidApp, setAnimationClass } from '@/utils';

const shouldShowMobileMenu = inject('shouldShowMobileMenu') as Ref<boolean>;

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const playMusic = computed(() => playerStore.playMusic as SongResult);
const artistList = computed(
  () =>
    (playerStore.playMusic?.ar || playerStore.playMusic?.song?.artists || []) as Array<{
      name: string;
    }>
);

// 播放控制
const { isPlaying: play, playMusicEvent, handleNext, handlePrev } = usePlaybackControl();

// 背景颜色
const background = ref('#000');

// 全屏播放器
const MusicFullRef = ref<any>(null);

const setMusicFull = () => {
  playerStore.setMusicFull(!playerStore.musicFull);
  if (playerStore.musicFull) {
    settingsStore.showArtistDrawer = false;
  }
};

watch(
  () => playerStore.musicFull,
  (_newVal) => {
    // 状态栏样式更新已在 Web 环境下禁用
  }
);

const openPlayListDrawer = () => {
  playerStore.setPlayListDrawerVisible(true);
};

// 滑动切歌
const playBarRef = ref<HTMLElement | null>(null);
onMounted(() => {
  if (playBarRef.value) {
    const { direction } = useSwipe(playBarRef, {
      onSwipeEnd: () => {
        if (direction.value === 'left') handleNext();
        if (direction.value === 'right') handlePrev();
      },
      threshold: 30
    });
  }
});

watch(
  () => playerStore.playMusic,
  (music) => {
    background.value = (music?.backgroundColor as string) || '#000';
  },
  { immediate: true, deep: true }
);
</script>

<style lang="scss" scoped>
.mobile-play-bar {
  @apply fixed bottom-[76px] left-0 w-full flex flex-col;
  z-index: 10000;
  animation-duration: 0.3s !important;
  transition: all 0.3s ease;

  &.is-menu-show {
    bottom: calc(var(--safe-area-inset-bottom, 0) + 66px);
  }
  &.is-menu-hide {
    bottom: calc(var(--safe-area-inset-bottom, 0) + 10px);
  }

  &.play-bar-expanded {
    @apply bg-transparent;
    height: auto; /* 自动适应内容高度 */
    max-height: 230px; /* 限制最大高度 */
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.5) 20%,
      rgba(0, 0, 0, 0.8) 80%,
      rgba(0, 0, 0, 0.9) 100%
    );
  }

  &.play-bar-mini {
    @apply h-14 py-0;
  }

  &.android-native-player.play-bar-mini {
    left: 50%;
    width: min(500px, calc(100vw - 32px));
    translate: -50% 0;
    z-index: 10000;
  }

  &.android-native-player.play-bar-mini.is-menu-show {
    bottom: calc(var(--safe-area-inset-bottom, 0px) + 88px);
  }

  &.android-native-player.play-bar-mini.is-menu-hide {
    bottom: calc(var(--safe-area-inset-bottom, 0px) + 12px);
  }

  &.android-native-player.play-bar-expanded {
    left: 0;
    bottom: 0 !important;
    width: 100%;
    translate: none;
  }

  // 进度条
  .music-progress-bar {
    @apply flex items-center justify-between px-4 py-2 relative z-10;

    .current-time,
    .total-time {
      @apply text-xs text-white opacity-80;
    }

    .progress-wrapper {
      @apply flex-1 mx-3 flex flex-col items-center;

      .progress-slider {
        @apply w-full;

        :deep(.n-slider) {
          --n-rail-height: 3px;
          --n-rail-color: rgba(255, 255, 255, 0.15);
          --n-rail-color-dark: rgba(255, 255, 255, 0.15);
          --n-fill-color: #22c55e;
          --n-handle-size: 0px; /* 隐藏滑块 */
          --n-handle-color: #22c55e;

          &:hover {
            --n-handle-size: 10px; /* 鼠标悬停时显示滑块 */
          }

          .n-slider-rail {
            @apply rounded-full !important; /* 圆角进度条 */
          }

          .n-slider-fill {
            @apply rounded-full !important;
            box-shadow: 0 0 4px rgba(30, 215, 96, 0.5); /* 发光效果 */
          }

          .n-slider-handle {
            @apply transition-all duration-200;
            opacity: 0;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.7);
          }

          &:hover .n-slider-handle,
          &:active .n-slider-handle {
            opacity: 1;
          }
        }
      }

      .quality-label {
        @apply text-xs text-white opacity-70 mt-1;
      }
    }
  }

  // 主控制区
  .player-controls {
    @apply flex items-center justify-between px-8 py-3 relative z-10 pb-8;

    .control-btn {
      @apply flex items-center justify-center cursor-pointer transition;

      i {
        @apply text-white transition-all;
      }

      &.like i {
        @apply text-2xl;
      }

      &.prev i,
      &.next i {
        @apply text-3xl;
      }

      &.play-pause {
        @apply w-12 h-12 rounded-full flex items-center justify-center;
        background: rgba(255, 255, 255, 0.2);

        i {
          @apply text-4xl;
        }
      }

      &.list i {
        @apply text-2xl;
      }

      .like-active {
        @apply text-red-500;
      }
    }
  }

  // Mini模式样式
  .mobile-mini-controls {
    @apply flex items-center justify-between pr-4 mx-3 h-12 rounded-full bg-light-100 dark:bg-dark-100 shadow-lg;

    .mini-song-info {
      @apply flex items-center flex-1 min-w-0 cursor-pointer;

      .mini-song-cover {
        @apply w-12 h-12 rounded-full border-8 border-dark-300 dark:border-light-300;
      }

      .mini-song-text {
        @apply ml-3 min-w-0 flex-1 flex items-center;

        .mini-song-title {
          @apply text-sm font-medium;
        }

        .mini-song-artist {
          @apply text-xs text-gray-500 dark:text-gray-400;
        }
      }
    }

    .mini-playback-controls {
      @apply flex items-center;

      .mini-control-btn {
        @apply flex items-center justify-center cursor-pointer transition;

        &.play {
          @apply w-9 h-9 rounded-full flex items-center justify-center mr-2;
          @apply bg-gray-100 dark:bg-gray-800;

          .iconfont {
            @apply text-xl text-green-500 transition hover:text-green-600;
          }
        }
      }

      .mini-list-icon {
        @apply text-xl p-1 transition cursor-pointer;
        @apply hover:text-green-500;
      }
    }
  }

  &.android-native-player .mobile-mini-controls {
    height: 56px;
    margin: 0;
    padding-right: 12px;
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.76);
    box-shadow: 0 12px 34px rgba(18, 24, 22, 0.18);
    backdrop-filter: blur(28px) saturate(1.7);
    -webkit-backdrop-filter: blur(28px) saturate(1.7);

    .mini-song-cover {
      width: 42px;
      height: 42px;
      margin-left: 7px;
      border: 0;
      border-radius: 14px;
      object-fit: cover;
    }

    .mini-song-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .mini-song-title {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mini-playback-controls .mini-control-btn.play {
      width: 36px;
      height: 40px;
      margin-right: 4px;
      border-radius: 0;
      background: transparent;

      .iconfont {
        color: var(--accent, #fa2d48);
      }
    }

    .mini-playback-controls .mini-list-icon {
      color: var(--text-secondary, #77777c);
    }
  }

  :global(.dark) &.android-native-player .mobile-mini-controls {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(28, 28, 30, 0.8);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.4);
  }
}

.mobile-play-list-container {
  height: 60vh;
  width: 90vw;
  max-width: 400px;
  @apply relative rounded-t-2xl overflow-hidden;

  .mobile-play-list-back {
    backdrop-filter: blur(20px);
    @apply absolute top-0 left-0 w-full h-full;
    @apply bg-light dark:bg-black bg-opacity-90;
  }

  .mobile-play-list-item {
    @apply px-3 py-1;
  }
}
</style>
