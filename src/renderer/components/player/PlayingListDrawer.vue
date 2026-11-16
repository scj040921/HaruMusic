<template>
  <n-modal
    v-model:show="show"
    :z-index="10000000"
    @after-enter="locateCurrent"
    @after-leave="cancelDrag"
  >
    <div class="playlist-panel" role="dialog" aria-modal="true" aria-label="播放队列">
      <header class="queue-header">
        <div>
          <h2>播放队列</h2>
          <p>
            {{ playList.length }} 首歌曲<span v-if="query"> · 找到 {{ entries.length }} 首</span>
          </p>
        </div>
        <button type="button" class="queue-icon" aria-label="关闭播放队列" @click="show = false">
          <i class="ri-close-line" />
        </button>
      </header>
      <div class="queue-tools">
        <label class="queue-search"
          ><i class="ri-search-line" /><input
            v-model="query"
            type="search"
            placeholder="搜索歌曲或艺人"
            aria-label="搜索播放队列"
        /></label>
        <div class="queue-actions">
          <button type="button" :disabled="!currentSong?.id" @click="locateCurrent">
            定位当前
          </button>
          <button
            type="button"
            :disabled="!currentSong?.id || playList.length <= 1"
            @click="retainCurrent"
          >
            仅保留当前
          </button>
          <button type="button" :disabled="!playList.length" @click="clearQueue">清空队列</button>
        </div>
      </div>
      <div
        ref="listHost"
        class="playlist-panel-content"
        @pointermove="moveDrag"
        @pointerup="finishDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="lostCapture"
      >
        <p v-if="!entries.length" class="queue-empty">
          {{ query ? '没有找到匹配的歌曲' : '队列为空，选一首音乐开始聆听。' }}
        </p>
        <n-virtual-list v-else ref="virtualList" :item-size="72" :items="entries" key-field="key">
          <template #default="{ item }">
            <div
              class="queue-row"
              :data-queue-key="item.key"
              :class="{
                'queue-dragging': drag?.key === item.key && drag?.moved,
                'queue-drop-before': dropKey === item.key && drag && drag.index > item.index,
                'queue-drop-after': dropKey === item.key && drag && drag.index < item.index
              }"
            >
              <button
                type="button"
                class="queue-song"
                :aria-label="'播放 ' + item.song.name"
                :aria-current="sameSong(item.song, currentSong) ? 'true' : undefined"
                @click="player.setPlay(item.song)"
              >
                <img
                  v-if="item.song.picUrl"
                  :src="getImgUrl(item.song.picUrl, '100y100')"
                  alt=""
                  loading="lazy"
                  draggable="false"
                />
                <span v-else class="queue-cover-placeholder"><i class="ri-music-2-line" /></span>
                <span class="queue-copy"
                  ><strong :class="{ 'queue-current': sameSong(item.song, currentSong) }">{{
                    item.song.name
                  }}</strong
                  ><span>{{ artists(item.song) }}</span></span
                >
                <i
                  v-if="sameSong(item.song, currentSong)"
                  class="ri-volume-up-line queue-current"
                  aria-label="当前歌曲"
                />
              </button>
              <n-dropdown
                trigger="click"
                :options="songActions(item)"
                :z-index="10000002"
                @select="(key) => applyAction(key, item)"
              >
                <button
                  type="button"
                  class="queue-icon"
                  :aria-label="item.song.name + ' 的队列操作'"
                >
                  <i class="ri-more-2-fill" />
                </button>
              </n-dropdown>
              <button
                type="button"
                class="queue-icon queue-grip"
                :disabled="!!query.trim()"
                :aria-label="'拖动调整 ' + item.song.name + ' 的顺序'"
                title="拖动排序，也可用上下方向键"
                @pointerdown="startDrag($event, item)"
                @keydown.up.stop.prevent="moveOne(item, -1)"
                @keydown.down.stop.prevent="moveOne(item, 1)"
              >
                <i class="ri-draggable" />
              </button>
            </div>
          </template>
        </n-virtual-list>
      </div>
      <p class="queue-hint" aria-live="polite">
        {{
          drag?.moved
            ? '松手调整顺序'
            : announcement || '拖动右侧手柄排序，更多操作中可设为下一首。'
        }}
      </p>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useManagedDialog } from '@/hooks/useManagedDialog';
import { registerOverlay } from '@/services/overlayStack';
import { usePlayerStore } from '@/store/modules/player';
import type { SongResult } from '@/types/music';
import { getImgUrl } from '@/utils';
import { matchesMusicQuery, sameSong, songKey } from '@/utils/songIdentity';

const player = usePlayerStore(),
  dialog = useManagedDialog();
const announcement = ref('');
const show = computed({
  get: () => player.playListDrawerVisible,
  set: (value) => player.setPlayListDrawerVisible(value)
});
const playList = computed(() => player.playList as SongResult[]);
const currentSong = computed(() => player.playMusic as SongResult);
const query = ref('');
const virtualList = ref<any>(null),
  listHost = ref<HTMLElement | null>(null);
const entries = computed(() =>
  playList.value
    .map((song, index) => ({ song, index, key: songKey(song) }))
    .filter((item) => matchesMusicQuery(item.song, query.value))
);
type QueueEntry = (typeof entries.value)[number];
const entryMap = computed(() => new Map(entries.value.map((item) => [item.key, item])));
const artists = (song: SongResult) =>
  song.ar?.map((a) => a.name).join(' / ') ||
  song.artists?.map((a) => a.name).join(' / ') ||
  song.song?.artists?.map((a) => a.name).join(' / ') ||
  '未知艺人';
const songActions = (item: QueueEntry) => [
  { label: '下一首播放', key: 'next', disabled: sameSong(item.song, currentSong.value) },
  { label: '上移', key: 'up', disabled: item.index === 0 },
  { label: '下移', key: 'down', disabled: item.index === playList.value.length - 1 },
  { label: '移出队列', key: 'remove' }
];
function applyAction(key: string | number, item: QueueEntry) {
  if (key === 'next') {
    player.addToNextPlay(item.song);
    announcement.value = '已设为下一首';
  } else if (key === 'remove') {
    player.removeFromPlayList(item.song.id, item.song.source || 'netease');
    announcement.value = '已移出队列';
  } else moveOne(item, key === 'up' ? -1 : 1);
}
function moveOne(item: QueueEntry, delta: number) {
  const index = playList.value.findIndex((song) => sameSong(song, item.song));
  const target = playList.value[index + delta];
  if (target) {
    player.moveQueueSong(item.song, target);
    announcement.value = '已调整队列顺序';
  }
}
async function locateCurrent() {
  query.value = '';
  await nextTick();
  const index = playList.value.findIndex((song) => sameSong(song, currentSong.value));
  if (index >= 0) virtualList.value?.scrollTo({ top: index * 72 });
}
function retainCurrent() {
  player.retainCurrentSong();
  query.value = '';
  announcement.value = '已保留当前歌曲';
}
function clearQueue() {
  dialog.warning({
    title: '清空播放队列？',
    content: '当前播放也会停止。若想继续聆听，可选择「仅保留当前」。',
    positiveText: '清空',
    negativeText: '保留',
    onPositiveClick: () => {
      player.clearPlayAll();
      show.value = false;
    }
  });
}
let overlay: ReturnType<typeof registerOverlay> | undefined;

const drag = ref<{
  id: number;
  key: string;
  index: number;
  y: number;
  startY: number;
  moved: boolean;
} | null>(null);
const dropKey = ref<string | null>(null);
let scrollFrame = 0;
let scrollElement: HTMLElement | null = null;
let dragBounds: DOMRect | undefined;
function startDrag(event: PointerEvent, item: QueueEntry) {
  if (!event.isPrimary || event.button !== 0 || query.value.trim() || !listHost.value) return;
  cancelDrag();
  drag.value = {
    id: event.pointerId,
    key: item.key,
    index: item.index,
    y: event.clientY,
    startY: event.clientY,
    moved: false
  };
  dragBounds = listHost.value.getBoundingClientRect();
  scrollElement = listHost.value.querySelector('.v-vl');
  listHost.value.setPointerCapture(event.pointerId);
}
function hitTarget(x: number, y: number) {
  const row = document
    .elementsFromPoint(x, y)
    .map((el) => el.closest<HTMLElement>('[data-queue-key]'))
    .find((el) => el && listHost.value?.contains(el));
  const key = row?.dataset.queueKey;
  if (key && key !== drag.value?.key) dropKey.value = key;
}
let pointerX = 0;
function moveDrag(event: PointerEvent) {
  if (!drag.value || drag.value.id !== event.pointerId) return;
  drag.value.y = event.clientY;
  pointerX = event.clientX;
  if (!drag.value.moved && Math.abs(event.clientY - drag.value.startY) < 6) return;
  drag.value.moved = true;
  event.preventDefault();
  hitTarget(event.clientX, event.clientY);
  if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
}
function autoScroll() {
  scrollFrame = 0;
  if (!drag.value?.moved || !dragBounds || !scrollElement) return;
  const delta =
    drag.value.y < dragBounds.top + 32 ? -8 : drag.value.y > dragBounds.bottom - 32 ? 8 : 0;
  if (!delta) return;
  const before = scrollElement.scrollTop;
  scrollElement.scrollTop += delta;
  hitTarget(pointerX, Math.max(dragBounds.top + 8, Math.min(dragBounds.bottom - 8, drag.value.y)));
  if (scrollElement.scrollTop !== before) scrollFrame = requestAnimationFrame(autoScroll);
}
function finishDrag(event: PointerEvent) {
  if (!drag.value || drag.value.id !== event.pointerId) return;
  const from = entryMap.value.get(drag.value.key),
    target = dropKey.value ? entryMap.value.get(dropKey.value) : undefined;
  if (drag.value.moved && from && target) {
    player.moveQueueSong(from.song, target.song);
    announcement.value = '已调整队列顺序';
  }
  cancelDrag();
}
function cancelDrag() {
  const id = drag.value?.id;
  drag.value = null;
  dropKey.value = null;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  scrollElement = null;
  if (id !== undefined && listHost.value?.hasPointerCapture(id))
    listHost.value.releasePointerCapture(id);
}
function lostCapture(event: PointerEvent) {
  if (event.target === listHost.value && drag.value?.id === event.pointerId) cancelDrag();
}
watch(
  show,
  (value) => {
    cancelDrag();
    overlay?.remove();
    overlay = undefined;
    if (value) {
      query.value = '';
      announcement.value = '';
      overlay = registerOverlay(() => {
        show.value = false;
      });
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  cancelDrag();
  overlay?.remove();
  window.removeEventListener('resize', cancelDrag);
  window.removeEventListener('blur', cancelDrag);
});
onMounted(() => {
  window.addEventListener('resize', cancelDrag);
  window.addEventListener('blur', cancelDrag);
});
</script>

<style scoped>
.playlist-panel {
  width: min(560px, calc(100vw - 24px));
  height: min(
    720px,
    calc(100dvh - var(--safe-area-inset-top, 0px) - var(--safe-area-inset-bottom, 0px) - 48px)
  );
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-container, 32px);
  corner-shape: superellipse(2);
  background: var(--canvas, #fff);
  color: var(--text-primary, #111);
  box-shadow: 0 16px 48px #0002;
}
.playlist-panel.fade-in-scale-up-transition-enter-active,
.playlist-panel.fade-in-scale-up-transition-leave-active {
  transition:
    opacity 180ms ease,
    transform 420ms linear(0, 0.4, 0.8, 1.03, 1.01, 1) !important;
}
button {
  transition:
    transform 240ms linear(0, 0.4, 0.8, 1.03, 1.01, 1),
    color 140ms ease;
}
:global(.dark) .playlist-panel {
  background: var(--canvas, #111);
  color: var(--text-primary, #fff);
}
.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--surface-glass, #ffffff40);
  border-bottom: 1px solid var(--divider, #d9d9de);
  backdrop-filter: blur(24px) saturate(1.5);
}
h2 {
  font-size: 22px;
  font-weight: 700;
}
.queue-header p,
.queue-hint {
  font-size: 12px;
  color: var(--text-secondary, #77777c);
}
.queue-tools {
  padding: 12px 16px 0;
}
.queue-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 24px;
  background: var(--surface-secondary, #f2f2f7);
}
.queue-search input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  background: transparent;
  outline: none;
  font-size: 15px;
}
.queue-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.queue-actions button {
  min-height: 44px;
  padding: 8px;
  font-size: 12px;
  color: var(--accent, #fa2d48);
}
button:disabled {
  opacity: 0.35;
}
button:not(:disabled):active {
  transform: scale(0.97);
}
.playlist-panel-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 16px;
}
.queue-row {
  height: 72px;
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid var(--divider, #d9d9de);
  position: relative;
  transition: transform 260ms linear(0, 0.4, 0.8, 1.03, 1.01, 1);
}
.queue-song {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  text-align: left;
  min-height: 56px;
}
.queue-song img,
.queue-cover-placeholder {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  object-fit: cover;
}
.queue-cover-placeholder {
  display: grid;
  place-items: center;
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-secondary, #77777c);
}
.queue-copy {
  display: grid;
  min-width: 0;
  gap: 0;
}
.queue-copy strong,
.queue-copy > span {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.queue-copy strong {
  font-size: 15px;
  font-weight: 600;
}
.queue-copy > span {
  font-size: 12px;
  color: var(--text-secondary, #77777c);
}
.queue-current {
  color: var(--accent, #fa2d48);
}
.queue-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 20px;
  color: var(--text-secondary, #77777c);
}
.queue-icon:active {
  transform: scale(0.94);
}
.queue-grip {
  touch-action: none;
  cursor: grab;
}
.queue-dragging {
  transform: scale(1.02);
  opacity: 0.65;
}
.queue-drop-before::before,
.queue-drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent, #fa2d48);
  pointer-events: none;
}
.queue-drop-before::before {
  top: 0;
}
.queue-drop-after::after {
  bottom: 0;
}
.queue-hint {
  margin: 0;
  padding: 12px 16px 16px;
}
.queue-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 15px;
  color: var(--text-secondary, #77777c);
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent, #fa2d48);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .playlist-panel,
  button {
    transition: none !important;
  }
  .queue-row {
    transition: none;
  }
  .queue-dragging {
    transform: none;
  }
}
</style>
