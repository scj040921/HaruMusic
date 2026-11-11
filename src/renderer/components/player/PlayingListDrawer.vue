<template>
  <!-- 透明遮罩层，点击任意位置关闭 -->
  <div v-if="internalVisible" class="fixed-overlay" @click="closePanel"></div>

  <!-- 使用animate.css进行动画效果 -->
  <div
    v-if="internalVisible"
    class="playlist-panel"
    role="dialog"
    aria-modal="true"
    aria-label="播放队列"
    :class="[
      'animate__animated',
      closing
        ? isMobile
          ? 'animate__slideOutDown'
          : 'animate__slideOutRight'
        : isMobile
          ? 'animate__slideInUp'
          : 'animate__slideInRight'
    ]"
    @animationend="onAnimationEnd"
  >
    <div class="playlist-panel-header">
      <div class="title">{{ t('player.playBar.playList') }}</div>
      <div class="header-actions">
        <n-tooltip trigger="hover">
          <template #trigger>
            <div class="action-btn" @click="handleClearPlaylist">
              <i class="iconfont ri-delete-bin-line"></i>
            </div>
          </template>
          {{ t('player.playList.clearAll') }}
        </n-tooltip>
        <button type="button" aria-label="关闭播放队列" class="close-btn" @click="closePanel">
          <i class="iconfont ri-close-line"></i>
        </button>
      </div>
    </div>
    <div class="playlist-panel-content">
      <div v-if="playList.length === 0" class="empty-playlist">
        <i class="iconfont ri-music-2-line"></i>
        <p>{{ t('player.playList.empty') }}</p>
      </div>
      <n-virtual-list v-else ref="playListRef" :item-size="62" item-resizable :items="playList">
        <template #default="{ item }">
          <div
            class="music-play-list-content"
            :class="{ 'queue-dragging': draggedId === item.id }"
            draggable="true"
            @dragstart="dragStart($event, item)"
            @dragover.prevent
            @drop="dropSong($event, item)"
            @dragend="draggedId = null"
          >
            <div class="flex items-center justify-between">
              <button
                type="button"
                class="queue-song"
                aria-label="播放这首歌曲"
                @click="playerStore.setPlay(item)"
              >
                <img :src="getImgUrl(item.picUrl, '100y100')" :alt="item.name" />
                <div class="queue-song-copy">
                  <strong :class="{ 'queue-current': item.id === playMusic?.id }">{{
                    item.name
                  }}</strong
                  ><span>{{
                    item.ar?.map((artist) => artist.name).join(' / ') || item.artist || ''
                  }}</span>
                </div>
                <i
                  v-if="item.id === playMusic?.id"
                  class="ri-bar-chart-fill queue-playing"
                  aria-label="正在播放"
                />
              </button>
              <div class="queue-order" aria-label="调整队列顺序">
                <button
                  :disabled="playList.indexOf(item) === 0"
                  aria-label="上移"
                  @click.stop="moveSong(item, -1)"
                >
                  ↑</button
                ><button
                  :disabled="playList.indexOf(item) === playList.length - 1"
                  aria-label="下移"
                  @click.stop="moveSong(item, 1)"
                >
                  ↓
                </button>
              </div>
              <div class="delete-btn" @click.stop="handleDeleteSong(item)">
                <i
                  class="iconfont ri-delete-bin-line text-gray-400 hover:text-red-500 transition-colors"
                ></i>
              </div>
            </div>
          </div>
        </template>
      </n-virtual-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDialog, useMessage } from 'naive-ui';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { playMusic } from '@/hooks/MusicHook';
import { usePlayerStore } from '@/store/modules/player';
import type { SongResult } from '@/types/music';
import { getImgUrl, isMobile } from '@/utils';

const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const playerStore = usePlayerStore();

// 内部状态控制组件的可见性
const internalVisible = ref(false);
const closing = ref(false);

// 当前是否显示播放列表面板
const show = computed({
  get: () => playerStore.playListDrawerVisible,
  set: (value) => {
    playerStore.setPlayListDrawerVisible(value);
  }
});

// 监听外部可见性变化
watch(
  show,
  (newValue) => {
    if (newValue) {
      // 打开面板
      internalVisible.value = true;
      closing.value = false;
      // 在下一个渲染周期后滚动到当前歌曲
      nextTick(() => {
        scrollToCurrentSong();
      });
    } else {
      // 如果已经是关闭状态，不需要处理
      if (!internalVisible.value) return;

      // 开始关闭动画，等 animationend 后再隐藏
      closing.value = false;
      internalVisible.value = false;
    }
  },
  { immediate: true }
);

// 播放列表
const playList = computed(() => playerStore.playList as SongResult[]);

// 播放列表引用
const playListRef = ref<any>(null);
const draggedId = ref<SongResult['id'] | null>(null);
const reorderSong = (from: number, to: number) => {
  if (
    from < 0 ||
    to < 0 ||
    from >= playList.value.length ||
    to >= playList.value.length ||
    from === to
  )
    return;
  const reordered = [...playList.value];
  const [song] = reordered.splice(from, 1);
  reordered.splice(to, 0, song);
  playerStore.setPlayList(reordered, true, false, true);
};
const moveSong = (song: SongResult, delta: number) =>
  reorderSong(
    playList.value.findIndex((item) => item.id === song.id),
    playList.value.findIndex((item) => item.id === song.id) + delta
  );
const dragStart = (event: DragEvent, song: SongResult) => {
  draggedId.value = song.id;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
};
const dropSong = (_event: DragEvent, song: SongResult) => {
  if (draggedId.value !== null)
    reorderSong(
      playList.value.findIndex((item) => item.id === draggedId.value),
      playList.value.findIndex((item) => item.id === song.id)
    );
};

// 关闭面板
const closePanel = () => {
  show.value = false;
};

// 动画结束后隐藏组件
const onAnimationEnd = () => {
  if (closing.value) {
    internalVisible.value = false;
  }
};

// 清空播放列表
const handleClearPlaylist = () => {
  if (playList.value.length === 0) {
    message.info(t('player.playList.alreadyEmpty'));
    return;
  }

  if (isMobile.value) {
    closePanel();
  }

  dialog.warning({
    title: t('player.playList.clearConfirmTitle'),
    content: t('player.playList.clearConfirmContent'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    style: { zIndex: 999999999 }, // 确保对话框显示在遮罩之上
    onPositiveClick: () => {
      // 清空播放列表
      playerStore.clearPlayAll();
      message.success(t('player.playList.cleared'));
    }
  });
};

// 处理键盘事件
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && internalVisible.value) {
    closePanel();
  }
};

// 添加和移除键盘事件监听
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

// 滚动到当前播放歌曲
const scrollToCurrentSong = () => {
  // 延长等待时间，确保列表已渲染完成
  setTimeout(() => {
    if (playListRef.value && playList.value.length > 0) {
      const index = playerStore.playListIndex;
      console.log('滚动到歌曲索引:', index);
      playListRef.value.scrollTo({
        top: (index > 3 ? index - 3 : 0) * 62
      });
    }
  }, 100);
};

// 删除歌曲
const handleDeleteSong = (song: SongResult) => {
  playerStore.removeFromPlayList(song.id as number);
};
</script>

<style lang="scss" scoped>
.fixed-overlay {
  @apply fixed inset-0 z-[999999];
  pointer-events: auto; // 允许点击关闭
  cursor: default;
}

.playlist-panel {
  @apply fixed right-0 z-[9999999] rounded-l-xl overflow-hidden;
  width: 350px;
  height: 70vh;
  top: 15vh; // 距离顶部15%
  animation-duration: 0.4s !important; // 动画持续时间

  @apply bg-light dark:bg-dark shadow-2xl dark:border dark:border-gray-700;

  &-header {
    @apply flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-900;
    backdrop-filter: blur(10px);
    background-color: rgba(255, 255, 255, 0.7);

    .dark & {
      background-color: rgba(18, 18, 18, 0.7);
    }

    .title {
      @apply text-base font-medium text-gray-800 dark:text-gray-200;
    }

    .header-actions {
      @apply flex items-center;
    }

    .action-btn,
    .close-btn {
      @apply w-8 h-8 flex items-center justify-center rounded-full cursor-pointer mx-1 text-gray-800 dark:text-gray-200;
      @apply hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors;

      .iconfont {
        @apply text-xl;
      }
    }

    .action-btn {
      @apply text-gray-500 dark:text-gray-400;
      &:hover {
        @apply text-red-500 dark:text-red-400;
      }
    }
  }

  &-content {
    @apply h-[calc(70vh-60px)] overflow-hidden;
  }
}

.empty-playlist {
  @apply flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500;

  .iconfont {
    @apply text-5xl mb-4;
  }

  p {
    @apply text-sm;
  }
}

.music-play-list-content {
  @apply pr-2;
  border-bottom: 1px solid var(--divider, #d9d9de);
  transition:
    transform 180ms cubic-bezier(0.2, 1.3, 0.35, 1),
    opacity 180ms;
  &:active {
    transform: scale(0.985);
  }
  &:hover {
    .delete-btn {
      @apply visible;
    }
  }
  .delete-btn {
    @apply pr-2 cursor-pointer invisible;
    .iconfont {
      @apply text-lg;
    }
  }
}
:global(.salt-mode .playlist-panel) {
  --accent: var(--highlight);
  border-radius: var(--corner, 16px);
  border: 0;
  background: var(--background, #f5f1e9);
  box-shadow: 0 18px 56px #0002;
  backdrop-filter: none;
}
:global(.salt-mode .playlist-panel-header) {
  border-color: var(--stroke, #d7cec1);
  background: var(--background, #f5f1e9);
  backdrop-filter: none;
}
:global(.salt-mode .music-play-list-content) {
  min-height: 54px;
  border-color: var(--stroke, #d7cec1);
  background: transparent;
  transition:
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 180ms;
}
:global(.salt-mode .music-play-list-content.queue-dragging) {
  z-index: 2;
  transform: scale(1.025) translateY(-2px);
  opacity: 0.92;
  box-shadow: 0 10px 24px #0002;
}
:global(.salt-mode .queue-song img) {
  width: 40px;
  height: 40px;
  border-radius: var(--corner, 16px);
}
:global(.salt-mode .queue-song-copy .queue-current),
:global(.salt-mode .queue-playing) {
  color: var(--highlight);
  background: transparent;
}
:global(.salt-mode .queue-order button:focus-visible) {
  outline-color: var(--highlight);
}
.queue-song {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  padding: 8px 0;
}
.queue-song img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}
.queue-song-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.queue-song-copy strong,
.queue-song-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-song-copy strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #111);
}
.queue-song-copy span {
  font-size: 12px;
  color: var(--text-secondary, #77777c);
}
.queue-song-copy .queue-current,
.queue-playing {
  color: var(--accent, #fa2d48);
}
.queue-order {
  display: flex;
}
.queue-order button {
  min-width: 36px;
  min-height: 40px;
  color: var(--text-secondary, #77777c);
}
.queue-order button:disabled {
  opacity: 0.25;
}
.queue-order button:focus-visible {
  outline: 2px solid var(--accent, #fa2d48);
}

// 移动端适配
@media (max-width: 768px) {
  .playlist-panel {
    position: fixed;
    width: 100%;
    height: 80vh;
    top: auto;
    bottom: 0; // 移动端底部留出导航栏高度
    border-radius: 30px 30px 0 0;
    border-left: none;
    border-top: 1px solid theme('colors.gray.200');
    box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.1);

    &-header {
      @apply text-center relative px-4;

      &::before {
        content: '';
        position: absolute;
        top: -15px;
        left: 50%;
        transform: translateX(-50%);
        width: 40px;
        height: 5px;
        border-radius: 5px;
        background-color: rgba(150, 150, 150, 0.3);
      }
    }

    &-content {
      height: calc(80vh - 60px);
      @apply px-4;
      .delete-btn {
        @apply visible;
      }
    }
  }
}
</style>
