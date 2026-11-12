<template>
  <n-drawer
    v-model:show="isVisible"
    height="100%"
    placement="bottom"
    :style="{ background: targetBackground }"
    :to="`#layout-main`"
    :z-index="9998"
  >
    <div
      id="mobile-drawer-target"
      :class="[
        config.theme,
        `cover-style-${config.mobileCoverStyle}`,
        { 'is-landscape': isLandscape },
        { 'is-dark': isDark }
      ]"
    >
      <div
        v-if="config.theme !== 'light'"
        class="mobile-atmosphere"
        :style="mobileAtmosphereStyle"
        aria-hidden="true"
      />
      <!-- 顶部控制按钮 -->
      <div v-if="playMusic?.playLoading" class="loading-overlay">
        <i class="ri-loader-4-line loading-icon"></i>
      </div>
      <div
        class="control-btn absolute left-5"
        role="button"
        tabindex="0"
        aria-label="收起播放页面"
        @keydown.enter="closeMusicFull"
        @keydown.space.prevent="closeMusicFull"
        :class="{ 'pure-mode': config.pureModeEnabled }"
        @click="closeMusicFull"
      >
        <i class="ri-arrow-down-s-line"></i>
      </div>

      <!-- 右上角设置按钮 -->
      <div
        class="control-btn absolute right-5 flex items-center gap-2"
        :class="[
          { 'pure-mode': config.pureModeEnabled },
          hasSleepTimerActive ? '!w-auto !px-2' : ''
        ]"
      >
        <!-- 定时器倒计时显示 -->
        <div
          v-if="hasSleepTimerActive"
          class="flex items-center gap-1 px-2 py-1 rounded-full bg-black/30 backdrop-blur-sm text-xs text-white/90"
          @click="showPlayerSettings = true"
        >
          <i class="ri-timer-line text-green-400"></i>
          <span class="font-medium tabular-nums">{{ sleepTimerDisplayText }}</span>
        </div>
        <button type="button" aria-label="播放设置" @click="showPlayerSettings = true">
          <i class="ri-more-2-fill"></i>
        </button>
      </div>

      <!-- 播放设置弹窗 -->
      <mobile-player-settings v-model:visible="showPlayerSettings" />

      <!-- 全屏歌词页面 - 竖屏模式下 -->
      <transition name="fade">
        <div v-if="showFullLyrics && !isLandscape" class="fullscreen-lyrics" :class="config.theme">
          <div class="fullscreen-header">
            <div class="song-title" v-html="playMusic.name"></div>
            <div class="artist-name">
              <span v-for="(item, index) in artistList" :key="index">
                {{ item.name }}{{ index < artistList.length - 1 ? ' / ' : '' }}
              </span>
            </div>
          </div>

          <div
            ref="lyricsScrollerRef"
            class="lyrics-scroller"
            @touchstart="handleTouchStart"
            @touchmove="handleTouchMove"
            @touchend="handleTouchEnd"
            @scroll="handleScroll"
          >
            <div class="lyrics-padding-top"></div>
            <!-- 无时间戳歌词提示 -->
            <div v-if="!supportAutoScroll" class="lyric-line no-scroll-tip">
              <span>{{ t('player.lrc.noAutoScroll') }}</span>
            </div>
            <div
              v-for="(item, index) in lrcArray"
              :key="index"
              :id="`lyric-line-${index}`"
              class="lyric-line"
              :class="{
                'now-text': index === nowIndex,
                'hover-text': item.text && item.startTime !== -1
              }"
              @click="item.startTime !== -1 ? setAudioTime(index) : null"
            >
              <!-- 逐字歌词显示 -->
              <div
                v-if="item.hasWordByWord && item.words && item.words.length > 0"
                class="word-by-word-lyric"
              >
                <template v-for="(word, wordIndex) in item.words" :key="wordIndex">
                  <span class="lyric-word" :style="getWordStyle(index, wordIndex, word)">
                    {{ word.text }} </span
                  ><span class="lyric-space" v-if="word.space">&nbsp;</span></template
                >
              </div>
              <!-- 普通歌词显示 -->
              <span v-else :style="getLrcStyle(index)">{{ item.text }}</span>
              <div v-if="config.showTranslation && item.trText" class="translation">
                {{ item.trText }}
              </div>
            </div>
            <div class="lyrics-padding-bottom"></div>
          </div>
        </div>
      </transition>

      <!-- 主要内容区域 - 竖屏模式下的普通布局 -->
      <transition name="fade">
        <div v-if="!showFullLyrics && !isLandscape" class="ios-layout-container">
          <!-- 封面区域 -->
          <div
            class="cover-container"
            :class="{
              'record-style': config.mobileCoverStyle === 'record',
              'square-style': config.mobileCoverStyle === 'square',
              'full-style': config.mobileCoverStyle === 'full',
              paused: !play
            }"
            @click="cycleCoverStyle"
          >
            <div class="img-wrapper">
              <n-image
                ref="PicImgRef"
                :src="getImgUrl(playMusic?.picUrl, '500y500')"
                lazy
                preview-disabled
                class="cover-image"
                :class="{ 'full-blend': config.mobileCoverStyle === 'full' }"
              />
            </div>
          </div>

          <div class="px-2 flex-1 flex flex-col justify-around w-[85%]">
            <!-- 歌曲信息 -->
            <div class="song-info">
              <div class="song-title-container">
                <h1 class="song-title" v-html="playMusic.name"></h1>
              </div>
              <p class="song-artist">
                <span
                  v-for="(item, index) in artistList"
                  :key="index"
                  class="artist-name"
                  @click="handleArtistClick(item.id)"
                >
                  {{ item.name }}
                  {{ index < artistList.length - 1 ? ' / ' : '' }}
                </span>
              </p>
              <button
                class="favorite-icon"
                type="button"
                :aria-pressed="isFavorite"
                :aria-label="isFavorite ? '取消喜欢' : '喜欢歌曲'"
                @click="toggleFavorite"
              >
                <i class="ri-heart-3-fill" :class="{ favorite: isFavorite }"></i>
              </button>
            </div>

            <!-- 歌词区域 -->
            <button
              v-if="!config.hideLyrics"
              class="lyrics-expand"
              type="button"
              @click="showFullLyricScreen"
              aria-label="打开纯歌词页面"
            >
              <i class="ri-fullscreen-line" /> 纯歌词
            </button>
            <div class="lyrics-container" v-if="!config.hideLyrics">
              <div
                v-if="lrcArray.length > 0"
                ref="lyricsScrollerRef"
                class="lyrics-wrapper"
                @touchstart.passive="handleTouchStart"
                @touchmove.passive="handleTouchMove"
                @touchend="handleTouchEnd"
                @scroll.passive="handleScroll"
              >
                <div
                  v-for="(line, idx) in visibleLyrics"
                  :key="idx"
                  :id="`lyric-line-${idx}`"
                  class="lyric-line"
                  :class="{ 'now-text': idx === nowIndex }"
                  @click="!touchMoved && setAudioTime(idx)"
                >
                  <!-- 逐字歌词显示 -->
                  <div
                    v-if="line.hasWordByWord && line.words && line.words.length > 0"
                    class="word-by-word-lyric"
                  >
                    <template v-for="(word, wordIndex) in line.words" :key="wordIndex">
                      <span
                        class="lyric-word"
                        :style="getWordStyle(line.originalIndex, wordIndex, word)"
                      >
                        {{ word.text }}</span
                      ><span v-if="word.space">&nbsp;</span></template
                    >
                  </div>
                  <!-- 普通歌词显示 -->
                  <span v-else :style="getLrcStyle(idx)">{{ line.text }}</span>
                  <div v-if="config.showTranslation && line.trText" class="translation">
                    {{ line.trText }}
                  </div>
                </div>
              </div>
              <div v-else class="no-lyrics">
                {{ t('player.lrc.noLrc') }}
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 横屏模式布局 -->
      <div v-if="isLandscape" class="landscape-layout">
        <!-- 左侧封面和进度条 -->
        <div class="landscape-left-section">
          <div
            class="landscape-cover-container cover-container"
            :class="{
              'record-style': config.mobileCoverStyle === 'record',
              'square-style': config.mobileCoverStyle === 'square',
              'full-style': config.mobileCoverStyle === 'full',
              paused: !play
            }"
            @click="cycleCoverStyle"
          >
            <div class="img-wrapper">
              <n-image
                :src="getImgUrl(playMusic?.picUrl, '500y500')"
                lazy
                preview-disabled
                class="cover-image"
                :class="{ 'full-blend': config.mobileCoverStyle === 'full' }"
              />
            </div>
          </div>

          <!-- 左侧进度条 -->
          <div class="landscape-progress-container">
            <div class="time-info">
              <span class="current-time">{{ secondToMinute(progressDisplayTime) }}</span>
              <span class="total-time">{{ secondToMinute(allTime) }}</span>
            </div>
            <div
              class="apple-style-progress"
              role="slider"
              tabindex="0"
              aria-label="播放进度"
              :aria-valuemin="0"
              :aria-valuemax="Math.round(allTime)"
              :aria-valuenow="Math.round(progressDisplayTime)"
              @pointerdown="handleProgressPointerDown"
              @pointermove="handleProgressPointerMove"
              @pointerup="handleProgressPointerUp"
              @pointercancel="handleProgressPointerCancel"
              @keydown="handleProgressKeyDown"
              @click="handleProgressClick"
            >
              <div class="progress-track">
                <div
                  class="progress-fill"
                  :style="{ width: `${(progressDisplayTime / Math.max(1, allTime)) * 100}%` }"
                ></div>
                <div
                  class="progress-thumb"
                  :class="{ active: isProgressDragging }"
                  :style="{ left: `${(progressDisplayTime / Math.max(1, allTime)) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧歌词区域 -->
        <div class="landscape-lyrics-section">
          <!-- 歌曲信息放置在顶部 -->
          <div class="landscape-song-info">
            <div class="flex flex-col flex-1">
              <h1 class="song-title" v-html="playMusic.name"></h1>
              <p class="song-artist">
                <span
                  v-for="(item, index) in artistList"
                  :key="index"
                  class="artist-name"
                  @click="handleArtistClick(item.id)"
                >
                  {{ item.name }}{{ index < artistList.length - 1 ? ' / ' : '' }}
                </span>
              </p>
            </div>
            <button
              class="favorite-icon landscape"
              type="button"
              :aria-pressed="isFavorite"
              :aria-label="isFavorite ? '取消喜欢' : '喜欢歌曲'"
              @click="toggleFavorite"
            >
              <i class="ri-heart-3-fill" :class="{ favorite: isFavorite }"></i>
            </button>
          </div>

          <!-- 歌词滚动区域 -->
          <div
            ref="landscapeLyricsRef"
            class="landscape-lyrics-scroller"
            @touchstart="handleTouchStart"
            @touchmove="handleTouchMove"
            @touchend="handleTouchEnd"
            @scroll="handleScroll"
          >
            <div class="lyrics-padding-top"></div>
            <!-- 无时间戳歌词提示 -->
            <div v-if="!supportAutoScroll" class="lyric-line no-scroll-tip">
              <span>{{ t('player.lrc.noAutoScroll') }}</span>
            </div>
            <div
              v-for="(item, index) in lrcArray"
              :key="index"
              :id="`landscape-lyric-line-${index}`"
              class="lyric-line"
              :class="{
                'now-text': index === nowIndex,
                'hover-text': item.text && item.startTime !== -1
              }"
              @click="item.startTime !== -1 ? setAudioTime(index) : null"
            >
              <!-- 逐字歌词显示 -->
              <div
                v-if="item.hasWordByWord && item.words && item.words.length > 0"
                class="word-by-word-lyric"
              >
                <template v-for="(word, wordIndex) in item.words" :key="wordIndex">
                  <span class="lyric-word" :style="getWordStyle(index, wordIndex, word)">
                    {{ word.text }} </span
                  ><span class="lyric-space" v-if="word.space">&nbsp;</span></template
                >
              </div>
              <!-- 普通歌词显示 -->
              <span v-else :style="getLrcStyle(index)">{{ item.text }}</span>
              <div v-if="config.showTranslation && item.trText" class="translation">
                {{ item.trText }}
              </div>
            </div>
            <div class="lyrics-padding-bottom"></div>
          </div>

          <!-- 右下角控制按钮 -->
          <div class="landscape-main-controls">
            <button type="button" class="main-button prev" aria-label="上一首" @click="prevSong">
              <i class="ri-skip-back-fill"></i>
            </button>
            <button
              type="button"
              class="main-button play-pause"
              :aria-label="play ? '暂停' : '播放'"
              :aria-pressed="play"
              @click="togglePlay"
            >
              <i :class="playIcon"></i>
            </button>
            <button type="button" class="main-button next" aria-label="下一首" @click="nextSong">
              <i class="ri-skip-forward-fill"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- 竖屏模式的控制区域 -->
      <div
        v-if="!isLandscape"
        class="unified-controls"
        :class="{ 'fullscreen-mode': showFullLyrics }"
      >
        <!-- 进度条 (苹果风格) -->
        <div class="progress-container">
          <div class="time-info">
            <span class="current-time">{{ secondToMinute(progressDisplayTime) }}</span>
            <span class="total-time">{{ secondToMinute(allTime) }}</span>
          </div>
          <div
            class="apple-style-progress"
            role="slider"
            tabindex="0"
            aria-label="播放进度"
            :aria-valuemin="0"
            :aria-valuemax="Math.round(allTime)"
            :aria-valuenow="Math.round(progressDisplayTime)"
            @pointerdown="handleProgressPointerDown"
            @pointermove="handleProgressPointerMove"
            @pointerup="handleProgressPointerUp"
            @pointercancel="handleProgressPointerCancel"
            @keydown="handleProgressKeyDown"
            @click="handleProgressClick"
          >
            <div class="progress-track">
              <div
                class="progress-fill"
                :style="{ width: `${(progressDisplayTime / Math.max(1, allTime)) * 100}%` }"
              ></div>
              <div
                class="progress-thumb"
                :class="{ active: isProgressDragging }"
                :style="{ left: `${(progressDisplayTime / Math.max(1, allTime)) * 100}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="control-buttons">
          <!-- 返回按钮，仅在全屏歌词模式下显示 -->
          <div
            v-if="showFullLyrics"
            class="back-button"
            role="button"
            tabindex="0"
            aria-label="退出纯歌词"
            @keydown.enter="closeFullLyrics"
            @keydown.space.prevent="closeFullLyrics"
            @click.stop="closeFullLyrics"
          >
            <i class="ri-arrow-down-s-line"></i>
          </div>
          <button
            type="button"
            class="side-button"
            aria-label="切换播放顺序"
            @click="togglePlayMode"
          >
            <i :class="[playModeIcon, { 'intelligence-active': playMode === 3 }]"></i>
          </button>
          <button type="button" class="main-button prev" aria-label="上一首" @click="prevSong">
            <i class="ri-skip-back-fill"></i>
          </button>
          <button
            type="button"
            class="main-button play-pause"
            :aria-label="play ? '暂停' : '播放'"
            :aria-pressed="play"
            @click="togglePlay"
          >
            <i :class="playIcon"></i>
          </button>
          <button type="button" class="main-button next" aria-label="下一首" @click="nextSong">
            <i class="ri-skip-forward-fill"></i>
          </button>
          <button type="button" class="side-button" aria-label="播放队列" @click="showPlaylist">
            <i class="iconfont icon-list"></i>
          </button>
        </div>
      </div>
    </div>
  </n-drawer>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import MobilePlayerSettings from '@/components/player/MobilePlayerSettings.vue';
import {
  allTime,
  correctionTime,
  getLrcIndex,
  lrcArray,
  lrcTimeArray,
  nowIndex,
  nowTime,
  setAudioTime,
  textColors
} from '@/hooks/MusicHook';
import { useArtist } from '@/hooks/useArtist';
import { useLyricBackground } from '@/hooks/useLyricBackground';
import { usePlayMode } from '@/hooks/usePlayMode';
import { audioService } from '@/services/audioService';
import { usePlayerStore } from '@/store/modules/player';
import { DEFAULT_LYRIC_CONFIG, LyricConfig } from '@/types/lyric';
import type { Artist, SongResult } from '@/types/music';
import { getImgUrl, secondToMinute } from '@/utils';
import { playFavoriteFeedback } from '@/utils/favoriteFeedback';
import { getTextColors } from '@/utils/linearColor';
import { LYRIC_CONFIG_CHANGE_EVENT, readLyricConfig } from '@/utils/lyricConfig';
import { showBottomToast } from '@/utils/shortcutToast';

const { t } = useI18n();
const playerStore = usePlayerStore();
const playMusic = computed(() => playerStore.playMusic as SongResult);
const artistList = computed(
  () => (playerStore.playMusic?.ar || playerStore.playMusic?.song?.artists || []) as Artist[]
);

// 播放控制相关
const play = computed(() => playerStore.isPlay);
const playIcon = computed(() => (play.value ? 'ri-pause-fill' : 'ri-play-fill'));

// 播放设置弹窗
const showPlayerSettings = ref(false);

// 定时器相关
const sleepTimerRefresh = ref(0);
let sleepTimerInterval: ReturnType<typeof setInterval> | null = null;

const hasSleepTimerActive = computed(() => playerStore.hasSleepTimerActive);

const sleepTimerDisplayText = computed(() => {
  void sleepTimerRefresh.value; // 触发响应式更新

  const timer = playerStore.sleepTimer;
  if (timer.type === 'time' && timer.endTime) {
    const remaining = Math.max(0, timer.endTime - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  if (timer.type === 'songs' && timer.remainingSongs) {
    return `${timer.remainingSongs}首`;
  }
  if (timer.type === 'end') {
    return '列表结束';
  }
  return '';
});

// 启动/停止定时器刷新
watch(
  hasSleepTimerActive,
  (active) => {
    if (active && playerStore.sleepTimer.type === 'time') {
      if (!sleepTimerInterval) {
        sleepTimerInterval = setInterval(() => {
          sleepTimerRefresh.value = Date.now();
        }, 1000);
      }
    } else {
      if (sleepTimerInterval) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
      }
    }
  },
  { immediate: true }
);

// 播放模式
const { playMode, playModeIcon, playModeText, togglePlayMode: togglePlayModeBase } = usePlayMode();
// 打开播放列表
const showPlaylist = () => {
  playerStore.setPlayListDrawerVisible(true);
};

// 喜欢歌曲
const isFavorite = computed(() => {
  const id = Number(playMusic.value?.id);
  return Number.isFinite(id) && playerStore.favoriteList.includes(id);
});

const toggleFavorite = (event: Event) => {
  const id = Number(playMusic.value?.id);
  if (!Number.isFinite(id)) return;
  const nextFavorite = !isFavorite.value;
  if (isFavorite.value) {
    playerStore.removeFromFavorite(id);
  } else {
    playerStore.addToFavorite(id);
  }
  playFavoriteFeedback(event.currentTarget, nextFavorite);
};

// 歌词全屏控制
const showFullLyrics = ref(false);
const isAutoScrollEnabled = ref(true);
const lyricsScrollerRef = ref<HTMLElement | null>(null);
const isTouchScrolling = ref(false);
const touchStartY = ref(0);
let touchMoved = false;
let scrollFrame = 0;
let lyricFrame = 0;
const lastScrollTop = ref(0);
const autoScrollTimer = ref<number | null>(null);
const isSongChanging = ref(false);

// 横屏检测相关
const { width, height } = useWindowSize();
const isLandscape = computed(() => width.value > height.value);
const landscapeLyricsRef = ref<HTMLElement | null>(null);

// 监听横屏变化
watch(isLandscape, (newVal) => {
  if (newVal) {
    // 横屏模式下，确保歌词容器可见并滚动到当前歌词
    nextTick(() => {
      setTimeout(() => {
        scrollToCurrentLyric(true, landscapeLyricsRef.value);
      }, 300);
    });
  }
});

// 显示全屏歌词
// 显示全屏歌词
const showFullLyricScreen = () => {
  showFullLyrics.value = true;

  // 使用多次延迟尝试滚动，确保能够滚动到当前歌词
  nextTick(() => {
    scrollToCurrentLyric(true);

    setTimeout(() => {
      scrollToCurrentLyric(true);
    }, 200);

    setTimeout(() => {
      scrollToCurrentLyric(true);
    }, 500);
  });
};

const supportAutoScroll = computed(() => {
  return lrcArray.value.length > 0 && lrcArray.value[0].startTime !== -1;
});

// 关闭全屏歌词
const closeFullLyrics = () => {
  showFullLyrics.value = false;
  if (autoScrollTimer.value) {
    clearTimeout(autoScrollTimer.value);
    autoScrollTimer.value = null;
  }
};

// 滚动到当前歌词，添加错误处理和日志
const scrollToCurrentLyric = (immediate = false, customScrollerRef?: HTMLElement | null) => {
  try {
    const scrollerRef = customScrollerRef || lyricsScrollerRef.value;
    if (!scrollerRef) {
      console.log('歌词容器引用不存在');
      return;
    }

    if (!supportAutoScroll.value) {
      console.log('歌词不支持自动滚动');
      return;
    }

    // 如果用户正在手动滚动，不打断他们的操作
    if (isTouchScrolling.value && !immediate) {
      return;
    }

    const prefix = customScrollerRef ? 'landscape-' : '';
    const activeEl = document.getElementById(`${prefix}lyric-line-${nowIndex.value}`);
    if (!activeEl) {
      console.log(`找不到当前歌词元素: ${prefix}lyric-line-${nowIndex.value}`);
      return;
    }

    // Keep enough leading/trailing room to center even the first/last lyric.
    scrollerRef.style.paddingBlock = `${scrollerRef.clientHeight / 2}px`;
    const containerRect = scrollerRef.getBoundingClientRect();
    const lineRect = activeEl.getBoundingClientRect();

    // 优化滚动位置计算，确保当前歌词在视图中央
    const scrollTop =
      scrollerRef.scrollTop +
      (lineRect.top - containerRect.top) -
      containerRect.height / 2 +
      lineRect.height / 2;

    cancelAnimationFrame(scrollFrame);
    const target = Math.max(
      0,
      Math.min(scrollTop, scrollerRef.scrollHeight - scrollerRef.clientHeight)
    );
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scrollerRef.scrollTo({ top: target, behavior: 'instant' });
      return;
    }
    let position = scrollerRef.scrollTop;
    let velocity = 0;
    let last = performance.now();
    const follow = (stamp: number) => {
      const dt = Math.min((stamp - last) / 1000, 0.032);
      last = stamp;
      velocity += ((target - position) * 180 - velocity * 26) * dt;
      position += velocity * dt;
      scrollerRef.scrollTop = position;
      if (Math.abs(target - position) > 0.3 || Math.abs(velocity) > 1) {
        scrollFrame = requestAnimationFrame(follow);
      } else scrollerRef.scrollTop = target;
    };
    scrollFrame = requestAnimationFrame(follow);
  } catch (err) {
    console.error('滚动歌词出错:', err);
  }
};

// 监听歌词变化，自动滚动
watch(nowIndex, (newIndex, oldIndex) => {
  console.log(`歌词索引变化: ${oldIndex} -> ${newIndex}`);

  // 歌曲切换时不自动滚动
  if (isSongChanging.value) return;

  // 在竖屏全屏歌词模式下滚动
  if (!isLandscape.value) {
    nextTick(() => {
      scrollToCurrentLyric(false);
    });
  }
  // 在横屏模式下滚动
  else if (isLandscape.value) {
    nextTick(() => {
      scrollToCurrentLyric(false, landscapeLyricsRef.value);
    });
  }
});

// 当显示状态变化时，触发滚动
watch(showFullLyrics, (newVal) => {
  if (newVal) {
    nextTick(() => {
      setTimeout(() => {
        scrollToCurrentLyric(true);
      }, 300);
    });
  }
});

// 监听音乐播放时间变化，触发歌词滚动更新
// nowIndex is derived from the audio clock. Scroll once per line rather than
// restarting a smooth scroll on every audio frame.

// 处理滚动事件
const handleScroll = () => {
  if (!isTouchScrolling.value) return;

  // 用户手动滚动时，临时停止自动滚动
  isAutoScrollEnabled.value = false;

  // 清除之前的计时器
  if (autoScrollTimer.value) {
    clearTimeout(autoScrollTimer.value);
  }

  // 设置新的计时器，3秒后恢复自动滚动
  autoScrollTimer.value = window.setTimeout(() => {
    isAutoScrollEnabled.value = true;
    isTouchScrolling.value = false;

    // 滚动到当前歌词
    if (showFullLyrics.value) {
      scrollToCurrentLyric(false);
    } else if (isLandscape.value) {
      scrollToCurrentLyric(false, landscapeLyricsRef.value);
    }
  }, 3000);
};

// 触摸相关事件
const handleTouchStart = (e: TouchEvent) => {
  cancelAnimationFrame(scrollFrame);
  touchMoved = false;
  touchStartY.value = e.touches[0].clientY;

  // 根据当前模式获取正确的滚动容器
  const scrollerRef = showFullLyrics.value
    ? lyricsScrollerRef.value
    : isLandscape.value
      ? landscapeLyricsRef.value
      : lyricsScrollerRef.value;

  lastScrollTop.value = scrollerRef?.scrollTop || 0;
  isTouchScrolling.value = true;

  // 用户开始触摸时，暂时停止自动滚动
  isAutoScrollEnabled.value = false;

  // 清除之前可能存在的计时器
  if (autoScrollTimer.value) {
    clearTimeout(autoScrollTimer.value);
    autoScrollTimer.value = null;
  }
};

const handleTouchMove = (event: TouchEvent) => {
  if (Math.abs(event.touches[0].clientY - touchStartY.value) > 8) touchMoved = true;
  if (!isTouchScrolling.value) return;
  // 实际的滚动处理由浏览器默认行为完成
};

const handleTouchEnd = () => {
  // 设置计时器，3秒后恢复自动滚动
  if (autoScrollTimer.value) {
    clearTimeout(autoScrollTimer.value);
  }

  autoScrollTimer.value = window.setTimeout(() => {
    isAutoScrollEnabled.value = true;
    isTouchScrolling.value = false;

    // 恢复自动滚动到当前歌词
    if (!isLandscape.value) {
      scrollToCurrentLyric(false);
    } else if (isLandscape.value) {
      scrollToCurrentLyric(false, landscapeLyricsRef.value);
    }
  }, 3000);
};

// 封面样式循环切换
const cycleCoverStyle = () => {
  const styles = ['record', 'square', 'full'];
  const currentIdx = styles.indexOf(config.value.mobileCoverStyle);
  const nextIdx = (currentIdx + 1) % styles.length;
  config.value.mobileCoverStyle = styles[nextIdx] as 'record' | 'square' | 'full';

  // 添加动画反馈
  const container = document.querySelector('.cover-container');
  if (container) {
    container.classList.add('style-changing');
    setTimeout(() => {
      container.classList.remove('style-changing');
    }, 500);
  }
};

// Scrub the timeline with Pointer Events so touch and mouse use one path.
// Capturing the pointer on the whole hit area also lets a finger start on the
// thin track instead of having to land precisely on the small thumb.
const isProgressDragging = ref(false);
const progressPreviewTime = ref(0);
const progressDisplayTime = computed(() =>
  isProgressDragging.value ? progressPreviewTime.value : nowTime.value
);
let activeProgressPointerId: number | null = null;
let lastPointerSeekAt = 0;

const progressTimeAtPointer = (event: PointerEvent): number | null => {
  const bar = event.currentTarget as HTMLElement | null;
  const rect = bar?.getBoundingClientRect();
  const duration = Number(allTime.value);
  if (!rect || rect.width <= 0 || !Number.isFinite(duration) || duration <= 0) return null;
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return progress * duration;
};

const applyProgressPointerTime = (event: PointerEvent) => {
  const time = progressTimeAtPointer(event);
  if (time !== null) progressPreviewTime.value = time;
  return time;
};

const handleProgressPointerDown = (event: PointerEvent) => {
  if ((event.pointerType === 'mouse' && event.button !== 0) || !playerStore.playMusic?.id) return;
  const time = progressTimeAtPointer(event);
  if (time === null) return;

  event.preventDefault();
  event.stopPropagation();
  activeProgressPointerId = event.pointerId;
  isProgressDragging.value = true;
  progressPreviewTime.value = time;
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is not available on a few older WebView implementations.
  }
};

const handleProgressPointerMove = (event: PointerEvent) => {
  if (!isProgressDragging.value || activeProgressPointerId !== event.pointerId) return;
  const time = applyProgressPointerTime(event);
  if (time === null) return;
  event.preventDefault();
  event.stopPropagation();
};

const finishProgressPointer = (event: PointerEvent, commit: boolean) => {
  if (!isProgressDragging.value || activeProgressPointerId !== event.pointerId) return;
  applyProgressPointerTime(event);

  const sound = audioService.getCurrentSound();
  if (commit && sound?.src && Number.isFinite(progressPreviewTime.value)) {
    lastPointerSeekAt = Date.now();
    audioService.seek(progressPreviewTime.value);
  } else if (sound && Number.isFinite(sound.currentTime)) {
    progressPreviewTime.value = sound.currentTime;
  }

  isProgressDragging.value = false;
  activeProgressPointerId = null;
  event.preventDefault();
  event.stopPropagation();
};

const handleProgressPointerUp = (event: PointerEvent) => finishProgressPointer(event, true);
const handleProgressPointerCancel = (event: PointerEvent) => finishProgressPointer(event, false);
const handleProgressKeyDown = (event: KeyboardEvent) => {
  const duration = Number(allTime.value);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const step = event.shiftKey ? 30 : 5;
  const current = progressDisplayTime.value;
  const next =
    event.key === 'ArrowRight'
      ? current + step
      : event.key === 'ArrowLeft'
        ? current - step
        : event.key === 'PageUp'
          ? current + 30
          : event.key === 'PageDown'
            ? current - 30
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? duration
                : null;
  if (next === null) return;
  event.preventDefault();
  audioService.seek(Math.max(0, Math.min(duration, next)));
};
const handleProgressClick = (event: MouseEvent) => {
  if (Date.now() - lastPointerSeekAt < 400) return;
  const bar = event.currentTarget as HTMLElement | null;
  const rect = bar?.getBoundingClientRect();
  const duration = Number(allTime.value);
  if (!rect || rect.width <= 0 || !Number.isFinite(duration) || duration <= 0) return;
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  audioService.seek(progress * duration);
};

// 背景相关（由 composable 管理）
const { isDark, applyBackground } = useLyricBackground({
  writeBgColor: () => playerStore.playMusic.backgroundColor || undefined
});
const config = ref<LyricConfig>({ ...DEFAULT_LYRIC_CONFIG });

// 监听设置页等外部来源的配置变更，保持移动端播放页与设置页状态同步（#758）
const handleLyricConfigChange = () => {
  config.value = readLyricConfig();
};

// 可见歌词计算
const visibleLyrics = computed(() => {
  return lrcArray.value.map((item, idx) => ({
    ...item,
    originalIndex: idx
  }));
});

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  background: {
    type: String,
    default: ''
  }
});

const themeMusic = {
  light: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
  dark: 'linear-gradient(to bottom, #1a1a1a, #000000)'
};

const emit = defineEmits(['update:modelValue']);

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const targetBackground = computed(() => {
  if (config.value.theme !== 'default') {
    return themeMusic[config.value.theme] || props.background;
  }
  return props.background || playerStore.playMusic.backgroundColor || '#19191c';
});

// Quantize the audio clock to 2 Hz so Vue does not patch a full-screen blurred
// layer for every media timeupdate. The visual phase still pauses/seeks with audio.
const atmosphereAudioPhase = computed(() => Math.floor(nowTime.value * 2) / 2);
const mobileAtmosphereStyle = computed(() => {
  const audioPhase = atmosphereAudioPhase.value;
  return {
    '--art-tone': playerStore.playMusic.primaryColor || '#71695a',
    '--art-cover': playMusic.value.picUrl
      ? `url(${JSON.stringify(getImgUrl(playMusic.value.picUrl, '600y600'))})`
      : 'none',
    '--ambient-x': `${Math.sin(audioPhase / 9) * 3}%`,
    '--ambient-scale': String(1.08 + Math.sin(audioPhase / 13) * 0.02)
  };
});

// 监听目标背景变化并更新文字颜色
watch(
  targetBackground,
  (newBg) => {
    if (newBg) {
      applyBackground(newBg);
    }
  },
  { immediate: true }
);

// 组件卸载清理
onBeforeUnmount(() => {
  cancelAnimationFrame(scrollFrame);
  cancelAnimationFrame(lyricFrame);
  window.removeEventListener(LYRIC_CONFIG_CHANGE_EVENT, handleLyricConfigChange);

  if (autoScrollTimer.value) {
    clearTimeout(autoScrollTimer.value);
  }

  // 清理睡眠定时器倒计时刷新 interval，避免组件卸载后残留、闭包持有 store 无法回收
  if (sleepTimerInterval) {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = null;
  }

  isProgressDragging.value = false;
  activeProgressPointerId = null;
});

const { navigateToArtist } = useArtist();

const handleArtistClick = (id: number) => {
  isVisible.value = false;
  navigateToArtist(id);
};

// 播放控制功能
const togglePlay = () => {
  try {
    if (playMusic.value?.id) playerStore.setPlay(playMusic.value);
  } catch (error) {
    console.error('播放出错:', error);
  }
};

const nextSong = () => {
  playerStore.nextPlay();
};

const prevSong = () => {
  playerStore.prevPlay();
};

const togglePlayMode = () => {
  togglePlayModeBase();
  showBottomToast(playModeText.value);
};

const closeMusicFull = () => {
  isVisible.value = false;
  playerStore.setMusicFull(false);
};

// 添加对 playMusic.id 的监听，歌曲切换时滚动到顶部
watch(
  () => playMusic.value?.id,
  (newId, oldId) => {
    // 只在歌曲真正切换时滚动到顶部
    if (newId !== oldId && newId) {
      isSongChanging.value = true;
      // 延迟滚动，确保 nowIndex 已重置
      setTimeout(() => {
        // 在全屏歌词模式下滚动到顶部
        if (showFullLyrics.value && lyricsScrollerRef.value) {
          lyricsScrollerRef.value.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
        // 在横屏模式下滚动到顶部
        else if (isLandscape.value && landscapeLyricsRef.value) {
          landscapeLyricsRef.value.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
        // 延迟恢复自动滚动，等待歌词数据更新
        setTimeout(() => {
          isSongChanging.value = false;
          nextTick(() =>
            scrollToCurrentLyric(true, isLandscape.value ? landscapeLyricsRef.value : undefined)
          );
        }, 300);
      }, 100);
    }
  }
);

// 加载保存的配置
onMounted(() => {
  const savedConfig = localStorage.getItem('music-full-config');
  if (savedConfig) {
    config.value = { ...config.value, ...JSON.parse(savedConfig) };
  }
  window.addEventListener(LYRIC_CONFIG_CHANGE_EVENT, handleLyricConfigChange);

  // 初始化自动滚动状态
  isAutoScrollEnabled.value = true;
  isTouchScrolling.value = false;

  // 等待DOM元素渲染完成后初始化歌词滚动
  nextTick(() => {
    if (isVisible.value) {
      // 在横屏模式下
      if (isLandscape.value) {
        setTimeout(() => {
          scrollToCurrentLyric(true, landscapeLyricsRef.value);
        }, 500);
      }
      // 在全屏歌词模式下
      else if (showFullLyrics.value) {
        setTimeout(() => {
          scrollToCurrentLyric(true);
        }, 500);
      }
    }
  });
});

// 当显示状态变化时，更新封面与背景融合效果
watch(isVisible, (newVal) => {
  if (newVal) {
    // 播放器显示时，重新设置背景颜色
    if (targetBackground.value) {
      applyBackground(targetBackground.value);
    }
  } else {
    showFullLyrics.value = false;
    if (autoScrollTimer.value) {
      clearTimeout(autoScrollTimer.value);
      autoScrollTimer.value = null;
    }
  }
});

// Only active lyric paint is sampled each frame; no list-wide reactive clock.
const getLrcStyle = (index: number) => {
  if (index !== nowIndex.value) return {};
  const colors = textColors.value || getTextColors();
  return {
    backgroundImage: `linear-gradient(to right, ${colors.active} var(--line-progress, 0%), ${colors.primary} var(--line-progress, 0%))`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent'
  };
};
const getWordStyle = (index: number, _wordIndex: number, _word: any) => {
  if (index !== nowIndex.value) return {};
  const colors = textColors.value || getTextColors();
  return {
    backgroundImage: `linear-gradient(to right, ${colors.active} var(--word-progress, 0%), ${colors.primary} var(--word-progress, 0%))`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  };
};
const paintLyrics = () => {
  if (!isVisible.value || document.hidden) return;
  const audio = audioService.getCurrentSound();
  if (!audio || !Number.isFinite(audio.currentTime)) return;
  const time = audio.currentTime;
  const index = getLrcIndex(time);
  if (nowIndex.value !== index) nowIndex.value = index;
  const scroller = isLandscape.value ? landscapeLyricsRef.value : lyricsScrollerRef.value;
  const line = scroller?.querySelector<HTMLElement>('.now-text');
  const start = lrcTimeArray.value[index];
  const end = lrcTimeArray.value[index + 1] ?? start + 1;
  const corrected = time + correctionTime.value;
  if (line && end > start) {
    const percent = Math.max(0, Math.min(100, ((corrected - start) / (end - start)) * 100));
    line.style.setProperty('--line-progress', `${percent}%`);
    const words = lrcArray.value[index]?.words || [];
    line.querySelectorAll<HTMLElement>('.lyric-word').forEach((element, wordIndex) => {
      const word = words[wordIndex];
      if (!word) return;
      const progress = Math.max(
        0,
        Math.min(100, ((corrected * 1000 - word.startTime) / Math.max(1, word.duration)) * 100)
      );
      element.style.setProperty('--word-progress', `${progress}%`);
    });
  }
};
watch(
  [isVisible, play],
  ([visible, playing]) => {
    cancelAnimationFrame(lyricFrame);
    const tick = () => {
      paintLyrics();
      if (visible && playing) lyricFrame = requestAnimationFrame(tick);
    };
    tick();
  },
  { immediate: true }
);
watch([lrcArray, showFullLyrics, isVisible], () =>
  nextTick(() => {
    scrollToCurrentLyric(true, isLandscape.value ? landscapeLyricsRef.value : undefined);
    paintLyrics();
  })
);
</script>

<style scoped lang="scss">
#mobile-drawer-target {
  @apply top-0 left-0 absolute overflow-hidden flex flex-col w-full h-full;
  animation-duration: 300ms;

  // 通用控制按钮样式
  .main-button {
    @apply flex items-center justify-center cursor-pointer transition-all duration-200 rounded-full;

    i {
      @apply text-2xl;
      color: var(--text-color-active);
    }

    &.play-pause {
      i {
        @apply text-4xl;
      }
    }

    &:hover {
      transform: scale(1.05);
    }

    &:active {
      transform: scale(0.95);
    }
  }

  // 通用进度条样式
  .apple-style-progress {
    @apply relative flex items-center cursor-pointer;
    min-height: 48px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;

    .progress-track {
      @apply relative w-full h-2 bg-white bg-opacity-20 rounded-full;

      .progress-fill {
        @apply absolute top-0 left-0 h-full bg-white rounded-full;
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
        z-index: 1;
        transition: width 0.1s linear;
      }

      .progress-thumb {
        @apply absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white;
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
        z-index: 2;
        transition: transform 0.15s ease-out;

        &.active {
          transform: translate(-50%, -50%) scale(1.3);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.9);
        }

        &:active {
          transform: translate(-50%, -50%) scale(1.3);
        }
      }
    }
  }

  // 通用唱片样式
  .record-style-common {
    @apply rounded-full overflow-hidden relative;
    aspect-ratio: 1/1;

    &::before {
      content: '';
      @apply absolute top-0 left-0 w-full h-full rounded-full z-10;
      background: radial-gradient(
        circle at center,
        transparent 38%,
        rgba(0, 0, 0, 0.15) 38%,
        rgba(0, 0, 0, 0.15) 39%,
        rgba(255, 255, 255, 0.1) 39%,
        rgba(255, 255, 255, 0.1) 39.5%,
        rgba(0, 0, 0, 0.08) 39.5%,
        rgba(0, 0, 0, 0.08) 40.5%,
        rgba(0, 0, 0, 0.2) 40.5%,
        rgba(0, 0, 0, 0.2) 41.5%,
        rgba(0, 0, 0, 0.6) 41.5%,
        rgba(0, 0, 0, 0.6) 100%
      );
      pointer-events: none;
      animation: spin 20s linear infinite;
      animation-play-state: running;
    }

    &::after {
      content: '';
      @apply absolute w-6 h-6 rounded-full bg-gray-900 z-20;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.4);
    }

    &.paused {
      &::before,
      &::after {
        animation-play-state: paused;
      }
    }

    .img-wrapper {
      @apply rounded-full overflow-hidden border-solid border-black z-0;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);

      &::after {
        content: '';
        @apply absolute top-0 left-0 w-full h-full rounded-full z-[2];
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.05) 0%,
          rgba(255, 255, 255, 0) 50%,
          rgba(0, 0, 0, 0.05) 100%
        );
        pointer-events: none;
      }
    }

    .cover-image {
      @apply w-full h-full rounded-full border-[2px] border-gray-900;
      animation: spin 20s linear infinite;
      animation-play-state: running;
    }

    &.paused .cover-image {
      animation-play-state: paused;
    }
  }

  // 通用时间显示样式
  .time-info {
    @apply flex justify-between items-center mb-2;

    .current-time,
    .total-time {
      @apply text-sm;
      color: var(--text-color-primary);
      opacity: 0.8;
    }
  }

  // 通用收藏按钮样式
  .favorite-icon {
    @apply cursor-pointer transition-all duration-200;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 22px;
    padding: 0;
    background: transparent;

    i {
      @apply text-xl;
      color: var(--text-color-primary);

      &.favorite {
        color: var(--accent, #fa2d48) !important;
      }
    }

    &:hover {
      transform: scale(1.1);
    }

    &:active {
      transform: scale(0.9);
    }

    &.landscape {
      i {
        @apply text-3xl;
      }
    }
  }

  // 通用歌曲信息样式
  .song-info-common {
    @apply z-[9995];

    .song-title {
      @apply font-bold line-clamp-1;
      color: var(--text-color-active);
    }

    .song-artist {
      @apply font-medium line-clamp-1;
      color: var(--text-color-primary);
      opacity: 0.9;

      .artist-name {
        @apply cursor-pointer;

        &:hover {
          @apply underline;
        }
      }
    }
  }

  // 横屏模式布局
  &.is-landscape {
    .landscape-layout {
      @apply flex flex-row w-full h-full overflow-hidden px-8 gap-4;

      // 左侧区域
      .landscape-left-section {
        @apply h-full flex flex-col items-center justify-center pt-6 pb-6 px-3 relative;
        width: 35%;
        min-width: 320px;
        max-width: 480px;

        // 封面
        .landscape-cover-container {
          @apply flex-shrink-0 mx-auto mb-4 z-[9995];
          width: 85%;
          max-width: 260px;
          min-width: 180px;

          &.record-style {
            @extend .record-style-common;

            .img-wrapper {
              @apply border-[20px];
              width: 90%;
              height: 90%;
            }
          }
        }

        // 左侧进度条
        .landscape-progress-container {
          @apply mt-0 mb-2 px-2 w-full max-w-md;

          .apple-style-progress {
            height: 48px; // 增加高度使更容易点击

            .progress-thumb {
              @apply w-5 h-5;
            }
          }
        }
      }

      // 右侧区域
      .landscape-lyrics-section {
        @apply h-full flex-1 flex flex-col relative;

        // 歌曲信息
        .landscape-song-info {
          @apply flex justify-between items-center pt-5 z-[9995] px-4;
          @extend .song-info-common;

          .song-title {
            @apply text-2xl mb-1;
          }

          .song-artist {
            @apply text-base;
          }
        }

        // 歌词滚动区域
        .landscape-lyrics-scroller {
          @apply h-full w-full overflow-y-auto pt-24 pb-24;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          mask-image: linear-gradient(
            to bottom,
            transparent 5%,
            black 15%,
            black 85%,
            transparent 95%
          );
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 5%,
            black 15%,
            black 85%,
            transparent 95%
          );
        }

        // 控制按钮
        .landscape-main-controls {
          @apply fixed bottom-6 right-6 flex items-center z-[10000];

          .main-button {
            @apply mx-2;
            width: 54px;
            height: 54px;
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(8px);
            border-radius: 50%;

            &.play-pause {
              width: 70px;
              height: 70px;
              background-color: rgba(255, 255, 255, 0.25);
            }
          }
        }
      }
    }
  }

  // 竖屏模式布局
  &:not(.is-landscape) {
    .ios-layout-container {
      @apply flex flex-col items-center justify-between w-full h-full pt-10;
      padding-bottom: 180px; // 为控制区域留出空间

      // 封面样式
      .cover-container {
        @apply relative mb-6 transition-all duration-500 border-gray-900 z-[9995];

        &.style-changing {
          animation: styleChange 0.5s ease;
        }

        &.record-style {
          @extend .record-style-common;
          @apply w-72 h-72;

          .img-wrapper {
            @apply border-[40px];
            width: 90%;
            height: 90%;
          }
        }
      }

      // 歌曲信息
      .song-info {
        @apply flex flex-col items-center mb-5 w-full z-[9995];
        @extend .song-info-common;

        .song-title-container {
          @apply w-full text-center;

          .song-title {
            @apply text-2xl inline-block;
          }
        }

        .song-artist {
          @apply text-base mb-2;
        }

        .ri-heart-3-fill {
          @apply text-2xl;
        }
      }
    }

    // 统一控制区域
    .unified-controls {
      @apply fixed bottom-0 left-0 right-0 px-6 pt-6 pb-6;
      background: transparent;
      height: 230px;
      pointer-events: auto;
      z-index: 10000 !important;

      .progress-container {
        @apply w-full mb-6;

        .apple-style-progress {
          height: 40px;

          .progress-thumb {
            @apply w-4 h-4;
          }
        }
      }

      .control-buttons {
        @apply flex items-center justify-between w-full px-4;

        .side-button {
          @apply w-10 h-10 flex items-center justify-center cursor-pointer transition-all duration-200;

          i {
            @apply text-2xl;
            color: var(--text-color-primary);

            &.intelligence-active {
              @apply text-green-500;
            }
          }

          &:hover {
            i {
              color: var(--text-color-active);
            }
          }
        }

        .main-button {
          @apply w-14 h-14;

          i {
            @apply text-3xl;
          }

          &.play-pause {
            @apply w-16 h-16 bg-white/15 rounded-full backdrop-blur-sm;

            i {
              @apply text-4xl;
            }
          }

          &:hover:not(.play-pause) {
            i {
              color: var(--text-color-active);
            }
          }

          &.play-pause:hover {
            @apply bg-white/30;
          }
        }
      }
    }
  }
}

// 旋转动画
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

// 加载动画
.loading-overlay {
  @apply absolute top-0 left-0 w-full h-full flex items-center justify-center;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9999999999;

  .loading-icon {
    font-size: 36px;
    color: white;
    animation: spin 1s linear infinite;
  }
}

// 根据封面样式调整容器布局
#mobile-drawer-target.cover-style-record {
  .ios-layout-container .cover-container {
    @apply mt-4;
  }
}

#mobile-drawer-target.cover-style-full {
  .ios-layout-container {
    @apply pt-0;
  }
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes styleChange {
  0% {
    opacity: 0.7;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.03);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes clickPulse {
  0% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pulse {
  0% {
    opacity: 0.9;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.9;
  }
}

.favorite-icon {
  @apply cursor-pointer transition-all duration-200;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 22px;
  padding: 0;
  background: transparent;

  i {
    @apply text-xl;
    color: var(--text-color-primary);

    &.favorite {
      color: var(--accent, #fa2d48) !important;
    }
  }

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.9);
  }

  &.landscape {
    @apply mt-2;
    i {
      @apply text-2xl;
    }
  }
}

// 歌曲标题容器样式
.song-title-container {
  @apply w-full flex items-center justify-center relative;

  .song-title {
    @apply text-center text-2xl font-bold max-w-[80%] truncate;
    color: var(--text-color-active);
  }
}

// 通用歌词样式
.lyric-line {
  @apply cursor-pointer transition-all duration-300 font-medium;
  font-weight: 500;
  letter-spacing: var(--lyric-letter-spacing, 0);
  line-height: var(--lyric-line-height, 1.6);
  color: var(--text-color-primary);
  opacity: 0.8;

  &.no-scroll-tip {
    @apply text-base opacity-60 cursor-default py-2;
    color: var(--text-color-primary);
    font-weight: normal;

    span {
      padding-right: 0;
    }
  }

  span {
    background-clip: text !important;
    -webkit-background-clip: text !important;
  }

  &.now-text {
    @apply font-medium;
    color: var(--text-color-active);
    opacity: 1;
  }

  &.clicked {
    animation: clickPulse 0.3s ease-in-out;
  }

  .translation {
    @apply font-normal opacity-70 mt-1 text-base;
  }

  // 逐字歌词样式
  .word-by-word-lyric {
    @apply flex flex-wrap justify-center;

    .lyric-word {
      @apply inline-block;
      font-weight: inherit;
      font-size: inherit;
      letter-spacing: inherit;
      line-height: inherit;
      cursor: inherit;
      position: relative;
      padding-right: 0 !important;

      &:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    }
  }
}

// 全屏歌词相关样式
.fullscreen-lyrics {
  @apply flex flex-col w-full h-full relative;

  &.light {
    background: linear-gradient(to bottom, #ffffff, #f5f5f5);
  }

  &.dark {
    background: linear-gradient(to bottom, #1a1a1a, #000000);
  }

  .fullscreen-header {
    @apply pt-16 pb-4 px-6 flex flex-col items-center fixed top-0 left-0 w-full z-10;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0) 100%);
    pointer-events: auto;

    .song-title {
      @apply text-xl font-semibold text-center mb-1 max-w-full line-clamp-1;
      color: var(--text-color-active);
    }

    .artist-name {
      @apply text-sm text-opacity-80 text-center;
      color: var(--text-color-primary);
    }
  }

  .lyrics-scroller {
    @apply flex-1 overflow-y-auto px-4;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 10%,
      black 90%,
      transparent 100%
    );
    padding-top: 100px;
    padding-bottom: 200px;
    margin-bottom: 180px;
    margin-top: 90px;

    .lyrics-padding-top {
      height: 70px;
      min-height: 70px;
    }

    .lyrics-padding-bottom {
      height: 150px;
      min-height: 150px;
    }

    .lyric-line {
      @apply px-6 py-4 text-center;
      font-size: var(--lyric-font-size, 22px);

      span {
        padding-right: 10px;
      }
    }

    .now-text {
      @apply text-2xl;
    }
  }
}

// 必要的控制按钮样式
.control-btn {
  @apply w-9 h-9 flex items-center justify-center rounded cursor-pointer transition-all duration-300 z-[9999];
  background: rgba(142, 142, 142, 0.192);
  backdrop-filter: blur(12px);
  top: calc(var(--safe-area-inset-top, 0) + 20px);

  i {
    @apply text-xl;
    color: var(--text-color-active);
  }

  &.pure-mode {
    background: transparent;
    backdrop-filter: none;

    &:not(:hover) {
      i {
        opacity: 0;
      }
    }
  }

  &:hover {
    background: rgba(126, 121, 121, 0.2);
    i {
      opacity: 1;
    }
  }
}

#mobile-drawer-target {
  // 横屏模式下的歌词样式
  &.is-landscape {
    .landscape-lyrics-section {
      .landscape-lyrics-scroller {
        .lyrics-padding-top {
          height: 30px;
          min-height: 30px;
        }

        .lyrics-padding-bottom {
          height: 100px;
          min-height: 100px;
        }

        .lyric-line {
          @apply px-4 py-3 text-left;
          font-size: 26px;
        }

        .now-text {
          @apply text-3xl;
        }
      }
    }

    .word-by-word-lyric {
      @apply justify-start;
    }
  }

  .unified-controls {
    &.fullscreen-mode {
      background: transparent;
    }

    .back-button {
      @apply absolute top-4 left-1/2 -translate-x-1/2 w-10 h-10 flex items-center justify-center bg-black bg-opacity-30 rounded-2xl;

      i {
        @apply text-4xl;
        color: var(--text-color-primary);
      }
    }
  }

  .ios-layout-container {
    .lyrics-container {
      @apply w-full flex-grow flex flex-col items-center justify-center mb-6 overflow-hidden cursor-pointer;

      .lyrics-wrapper {
        @apply w-full flex flex-col items-center justify-center;

        .lyric-line {
          @apply text-center py-1 transition-all duration-300 opacity-70;

          .translation {
            @apply text-sm opacity-60 mt-1;
          }
        }
      }

      .lyric-word {
        @apply px-[2px];
      }

      .no-lyrics {
        @apply text-center text-base opacity-60;
        color: var(--text-color-primary);
      }
    }
  }
}

.cover-container {
  // 方形封面样式
  &.square-style {
    @apply w-[85%] shadow-2xl shadow-black/50 rounded-xl overflow-hidden mt-8 aspect-square;

    .cover-image {
      @apply w-full h-full;
      transition: transform 0.3s ease-out;

      &:active {
        transform: scale(0.95);
      }
    }
  }

  // 全屏封面样式
  &.full-style {
    @apply w-full max-h-[50vh] relative overflow-hidden;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40%;
      background: linear-gradient(
        transparent,
        var(--bg-color, rgba(25, 25, 25, 1)) 70%,
        var(--bg-color, rgba(25, 25, 25, 1))
      );
      z-index: 1;
      pointer-events: none;
    }

    .cover-image {
      @apply w-full h-auto shadow-lg;

      &.full-blend {
        mix-blend-mode: luminosity;
      }
    }
  }
}

.is-dark {
  .square-style {
    @apply shadow-2xl shadow-black/50;
  }
}
/* Keep the cover's character while giving the audio-clock lyrics most of the
   remaining viewport. Both lyric modes retain native touch scrolling. */
#mobile-drawer-target:not(.is-landscape) .ios-layout-container {
  padding-top: calc(var(--safe-area-inset-top, 0px) + 56px);
  padding-bottom: calc(var(--safe-area-inset-bottom, 0px) + 156px);
  gap: 12px;
}
#mobile-drawer-target:not(.is-landscape) .ios-layout-container .cover-container {
  width: min(52vw, 220px);
  height: min(52vw, 220px);
  flex-shrink: 0;
  margin: 0;
}
#mobile-drawer-target .ios-layout-container > .flex-1 {
  min-height: 0;
  justify-content: flex-start;
  gap: 8px;
}
#mobile-drawer-target .ios-layout-container .song-info {
  margin-bottom: 0;
}
.lyrics-expand {
  align-self: flex-end;
  color: var(--text-color-active);
  background: transparent;
  border: 0;
  min-height: 44px;
  padding: 8px 12px;
  font-size: 12px;
}
#mobile-drawer-target .ios-layout-container .lyrics-container {
  min-height: 100px;
  flex: 1;
  margin: 0;
}
#mobile-drawer-target .ios-layout-container .lyrics-container .lyrics-wrapper {
  height: 100%;
  overflow-y: auto;
  display: block;
  touch-action: pan-y;
  overscroll-behavior: contain;
  padding: 48px 8px;
  mask-image: linear-gradient(transparent, black 16%, black 84%, transparent);
}
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line {
  font-size: clamp(20px, 5.5vw, 28px);
  line-height: 1.5;
  padding: 12px 0;
  opacity: 0.45;
  color: var(--text-color-primary);
  transform: scale(0.96);
  transition:
    transform 380ms cubic-bezier(0.2, 1.3, 0.3, 1),
    opacity 240ms;
}
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line.now-text {
  opacity: 1;
  color: var(--text-color-active);
  transform: scale(1);
  font-weight: 600;
}
#mobile-drawer-target:not(.is-landscape) .unified-controls {
  bottom: calc(48px + var(--safe-area-inset-bottom, 0px));
  height: 140px;
  padding: 8px 24px 16px;
}
#mobile-drawer-target .unified-controls .progress-container {
  margin-bottom: 0;
}
#mobile-drawer-target .fullscreen-lyrics {
  background: transparent;
}
#mobile-drawer-target .fullscreen-lyrics .lyrics-scroller {
  margin: 0;
  padding: calc(var(--safe-area-inset-top, 0px) + 100px) 16px 0;
  margin-bottom: calc(156px + var(--safe-area-inset-bottom, 0px));
  touch-action: pan-y;
  overscroll-behavior: contain;
}
#mobile-drawer-target .fullscreen-lyrics .lyrics-scroller .lyric-line {
  font-size: clamp(24px, 7vw, 36px);
  line-height: 1.5;
  text-align: left;
  padding: 16px;
}
#mobile-drawer-target:not(.is-landscape) .unified-controls .control-buttons .main-button.play-pause,
#mobile-drawer-target:not(.is-landscape)
  .unified-controls
  .control-buttons
  .main-button.play-pause:hover {
  background: transparent;
  backdrop-filter: none;
  box-shadow: none;
}
#mobile-drawer-target .apple-style-progress:focus:not(:focus-visible) {
  outline: none;
}
.mobile-atmosphere {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(
      ellipse at 15% 55%,
      color-mix(in srgb, var(--art-tone) 36%, transparent),
      transparent 75%
    ),
    #18181c;
}
.mobile-atmosphere::before {
  content: '';
  position: absolute;
  inset: -12%;
  background-image: var(--art-cover);
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(1.35) brightness(0.6);
  opacity: 0.5;
  transform: translateX(var(--ambient-x)) scale(var(--ambient-scale));
  transition: transform 1200ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
#mobile-drawer-target .ios-layout-container,
#mobile-drawer-target .fullscreen-lyrics {
  position: relative;
  z-index: 1;
}
#mobile-drawer-target.cover-style-full:not(.is-landscape) .ios-layout-container {
  padding-top: 0;
  gap: 0;
  padding-bottom: calc(180px + var(--safe-area-inset-bottom, 0px));
}
#mobile-drawer-target.cover-style-full:not(.is-landscape)
  .ios-layout-container
  .cover-container.full-style {
  width: 100%;
  height: clamp(240px, 43svh, 480px);
  max-height: none;
  border-radius: 0;
  overflow: hidden;
}
#mobile-drawer-target.cover-style-full .full-style::after {
  display: none;
}
#mobile-drawer-target.cover-style-full .full-style .img-wrapper,
#mobile-drawer-target.cover-style-full .full-style .cover-image {
  width: 100%;
  height: 100%;
}
#mobile-drawer-target.cover-style-full .full-style .cover-image.full-blend {
  mix-blend-mode: normal;
  mask-image: linear-gradient(black 0%, black 62%, rgb(0 0 0 / 80%) 76%, transparent 100%);
}
#mobile-drawer-target.cover-style-full .full-style :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 35%;
}
#mobile-drawer-target.cover-style-full .ios-layout-container > .flex-1 {
  width: calc(100% - 48px);
  margin-top: -8px;
}
#mobile-drawer-target.cover-style-full .ios-layout-container .song-info {
  position: relative;
  align-items: flex-start;
  padding-right: 56px;
}
#mobile-drawer-target.cover-style-full .song-info .song-title-container {
  text-align: left;
}
#mobile-drawer-target.cover-style-full .song-info .favorite-icon {
  position: absolute;
  right: 0;
  top: 8px;
}
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line {
  font-size: clamp(20px, var(--lyric-font-size, 5.5vw), 36px);
}
#mobile-drawer-target .fullscreen-lyrics .lyrics-scroller .lyric-line {
  font-size: clamp(24px, var(--lyric-font-size, 7vw), 48px);
}
/* Focus never changes line height, wrapping or padding. */
#mobile-drawer-target .lyric-line {
  overflow-wrap: anywhere;
  font-weight: 600;
  transform-origin: center;
  transition:
    transform 420ms cubic-bezier(0.2, 1.35, 0.3, 1),
    opacity 300ms,
    filter 300ms,
    text-shadow 300ms;
}
#mobile-drawer-target .lyrics-scroller {
  scroll-behavior: auto;
}
#mobile-drawer-target .lyric-line:not(.now-text) {
  opacity: 0.42;
  filter: blur(0.6px);
  transform: scale(0.96);
}
#mobile-drawer-target .lyric-line.now-text {
  opacity: 1;
  filter: none;
  transform: scale(1.035);
  text-shadow: 0 0 16px color-mix(in srgb, var(--text-color-active) 24%, transparent);
}
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line,
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line.now-text {
  font-size: clamp(22px, var(--lyric-font-size, 5.5vw), 36px);
  padding: 16px 8px;
  font-weight: 600;
  line-height: 1.5;
}
#mobile-drawer-target .ios-layout-container .lyrics-wrapper .lyric-line.now-text {
  transform: scale(1.035);
}
#mobile-drawer-target .fullscreen-lyrics .lyrics-scroller .lyric-line,
#mobile-drawer-target .fullscreen-lyrics .lyrics-scroller .lyric-line.now-text {
  font-size: clamp(26px, var(--lyric-font-size, 7vw), 48px);
  padding: 16px;
  line-height: 1.5;
}
#mobile-drawer-target .lyric-line .translation {
  font-size: 0.6em;
  line-height: 1.5;
}
#mobile-drawer-target .lyric-line .lyric-word {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  #mobile-drawer-target .lyric-line {
    transition: none;
    transform: none;
  }
}
#mobile-drawer-target .control-btn,
#mobile-drawer-target .side-button,
#mobile-drawer-target .back-button {
  min-width: 44px;
  min-height: 44px;
}
#mobile-drawer-target button:focus-visible,
#mobile-drawer-target [role='button']:focus-visible {
  outline: 2px solid var(--text-color-active);
  outline-offset: 4px;
}
#mobile-drawer-target .apple-style-progress {
  min-height: 44px;
}
#mobile-drawer-target .lyrics-expand {
  font-size: 13px;
}
/* Symmetric title gutters keep the heading centered independently of Like. */
#mobile-drawer-target:not(.is-landscape) .ios-layout-container .song-info {
  position: relative;
  align-items: center;
  padding-inline: 0;
  text-align: center;
  gap: 8px;
}
#mobile-drawer-target:not(.is-landscape) .ios-layout-container .song-title-container {
  width: 100%;
  padding-inline: 48px;
  box-sizing: border-box;
  justify-content: center;
  text-align: center;
}
#mobile-drawer-target:not(.is-landscape)
  .ios-layout-container
  .song-info
  .song-title-container
  .song-title {
  margin: 0;
  width: 100%;
  max-width: 100%;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', Roboto, 'Noto Sans CJK SC',
    'Microsoft YaHei', sans-serif;
  font-size: clamp(28px, 8vw, 36px);
  font-weight: 800;
  line-height: 1.18;
  letter-spacing: -0.035em;
  text-align: center;
  white-space: normal;
  text-overflow: clip;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-wrap: balance;
}
#mobile-drawer-target:not(.is-landscape) .ios-layout-container .song-artist {
  width: 100%;
  padding-inline: 48px;
  box-sizing: border-box;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  margin: 0;
}
#mobile-drawer-target:not(.is-landscape) .ios-layout-container .song-info .favorite-icon {
  position: absolute;
  right: 0;
  top: 0;
  min-width: 44px;
  min-height: 44px;
}
</style>
