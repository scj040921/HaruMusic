<template>
  <main class="android-downloads">
    <header>
      <p class="eyebrow">资料库</p>
      <h1>下载</h1>
      <p>保存音乐，离线也能随时收听。</p>
    </header>
    <div class="download-actions">
      <button
        class="glass-control primary"
        :disabled="preparing || !completed.length"
        @click="playCollection()"
      >
        播放已下载 · {{ completed.length }}
      </button>
      <button class="glass-control icon-only" aria-label="刷新下载" title="刷新" @click="refresh">
        <i class="ri-refresh-line" />
      </button>
      <button
        class="glass-control icon-only"
        aria-label="系统下载"
        title="系统下载"
        @click="openFolder"
      >
        <i class="ri-folder-music-line" />
      </button>
    </div>
    <p class="download-location">音乐保存在 Music / HaruMusic，后台下载由 Android 系统管理。</p>
    <label class="download-search"
      ><i class="ri-search-line" /><input
        v-model="query"
        type="search"
        placeholder="搜索歌曲或艺人"
        aria-label="搜索下载音乐"
    /></label>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="download-tabs" role="tablist" aria-label="下载状态">
      <button
        v-for="tab in ['全部', '下载中', '已完成', '失败']"
        :key="tab"
        role="tab"
        :aria-selected="selected === tab"
        @click="selected = tab"
      >
        {{ tab }}
      </button>
    </div>
    <p v-if="!filtered.length" class="empty">
      {{
        busy
          ? '正在读取下载…'
          : query
            ? '没有匹配的下载音乐。'
            : '暂无下载。在歌曲菜单或播放设置中选择「下载音乐」。'
      }}
    </p>
    <button v-if="selected === '失败' && filtered.length" class="clear-failed" @click="clearFailed">
      清理失败任务
    </button>
    <ul class="download-list">
      <li v-for="task in filtered" :key="task.taskId">
        <img :src="task.songInfo.picUrl || '/icon.png'" alt="" loading="lazy" />
        <div class="download-info">
          <strong>{{ task.songInfo.name }}</strong
          ><span>{{ task.songInfo.ar?.map((a) => a.name).join(' / ') }}</span>
          <span v-if="task.state === 'completed'">已下载 · {{ size(task.total) }}</span>
          <span v-else-if="task.state === 'error'" role="alert">{{ task.error }}</span>
          <template v-else
            ><progress
              :value="task.progress"
              max="100"
              :aria-label="task.songInfo.name + ' 下载进度'"
            /><span
              >{{
                task.state === 'queued' ? '等待网络 / 系统排队' : Math.round(task.progress) + '%'
              }}
              · {{ size(task.loaded) }}</span
            ></template
          >
        </div>
        <button
          v-if="task.state === 'completed'"
          class="icon-control"
          aria-label="离线播放"
          :disabled="preparing"
          @click="playCollection(task)"
        >
          <i class="ri-play-fill" />
        </button>
        <button
          v-if="task.state === 'error'"
          class="icon-control"
          aria-label="重新解析并下载"
          :disabled="!!retrying"
          :aria-busy="retrying === task.taskId"
          @click="retry(task)"
        >
          <i class="ri-restart-line" />
        </button>
        <button
          class="icon-control"
          :aria-label="task.state === 'completed' ? '删除下载文件' : '取消下载'"
          @click="remove(task)"
        >
          <i :class="task.state === 'completed' ? 'ri-delete-bin-line' : 'ri-close-line'" />
        </button>
      </li>
    </ul>
  </main>
</template>
<script setup lang="ts">
import { useMessage } from 'naive-ui';
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';

import { useDownload } from '@/hooks/useDownload';
import { useManagedDialog } from '@/hooks/useManagedDialog';
import {
  type AndroidDownload,
  androidDownloads,
  filterDownloads,
  toOfflineSong
} from '@/services/androidDownloads';
import { usePlayerStore } from '@/store/modules/player';
import type { SongResult } from '@/types/music';
const tasks = ref<AndroidDownload[]>([]),
  error = ref(''),
  busy = ref(false),
  selected = ref('全部'),
  query = ref('');
const { downloadMusic } = useDownload();
const player = usePlayerStore();
const message = useMessage();
const dialog = useManagedDialog();
let timer: ReturnType<typeof setTimeout> | undefined;
let active = false;
let refreshQueued = false;
const filtered = computed(() => filterDownloads(tasks.value, selected.value, query.value));
const completed = computed(() => filterDownloads(tasks.value, '已完成', query.value));
const size = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
async function refresh() {
  clearTimeout(timer);
  if (busy.value) {
    refreshQueued = true;
    return;
  }
  busy.value = true;
  try {
    tasks.value = [...(await androidDownloads.list()).tasks];
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
    if (refreshQueued && active && !document.hidden) {
      refreshQueued = false;
      void refresh();
    } else {
      refreshQueued = false;
      if (
        active &&
        !document.hidden &&
        tasks.value.some((t) => ['queued', 'downloading'].includes(t.state))
      )
        timer = setTimeout(refresh, 1500);
    }
  }
}
async function openFolder() {
  try {
    await androidDownloads.openFolder();
  } catch (e) {
    message.error((e as Error).message);
  }
}
const preparing = ref(false);
async function playCollection(task?: AndroidDownload) {
  if (preparing.value) return;
  const list = completed.value.map(toOfflineSong);
  const index = task ? list.findIndex((song) => song.id === `android-download:${task.taskId}`) : 0;
  if (!list.length || index < 0) return;
  preparing.value = true;
  const notice = message.loading('正在准备离线播放…', { duration: 0 });
  try {
    player.setPlayList(list, false, false, true);
    player.playListIndex = index;
    await player.setPlayMusic(list[index]);
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    preparing.value = false;
    notice.destroy();
  }
}
const retrying = ref<string | null>(null);
async function retry(task: AndroidDownload) {
  if (retrying.value) return;
  retrying.value = task.taskId;
  try {
    if (await downloadMusic(task.songInfo as SongResult))
      await androidDownloads.remove({ taskId: task.taskId });
    await refresh();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    retrying.value = null;
  }
}
function clearFailed() {
  const ids = filtered.value.filter((task) => task.state === 'error').map((task) => task.taskId);
  dialog.warning({
    title: `清理 ${ids.length} 个失败任务？`,
    content: '移除这些任务及未完成文件，保留所有已下载音乐。',
    positiveText: '清理',
    negativeText: '保留',
    onPositiveClick: async () => {
      try {
        for (const taskId of ids) await androidDownloads.remove({ taskId });
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        await refresh();
      }
    }
  });
}
function remove(task: AndroidDownload) {
  dialog.warning({
    title: task.state === 'completed' ? '删除下载文件？' : '取消下载？',
    content: task.songInfo.name,
    positiveText: '确认',
    negativeText: '保留',
    onPositiveClick: async () => {
      try {
        await androidDownloads.remove({ taskId: task.taskId });
        await refresh();
      } catch (e) {
        message.error((e as Error).message);
      }
    }
  });
}
const visibility = () => {
  if (active && !document.hidden) void refresh();
  else clearTimeout(timer);
};
const start = () => {
  if (active) return;
  active = true;
  void refresh();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('haru-download-added', refresh);
};
onMounted(start);
onActivated(start);
onDeactivated(() => {
  active = false;
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', visibility);
  window.removeEventListener('haru-download-added', refresh);
});
onBeforeUnmount(() => {
  active = false;
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', visibility);
  window.removeEventListener('haru-download-added', refresh);
});
</script>
<style scoped>
.android-downloads {
  padding: 24px 24px calc(var(--safe-area-inset-bottom, 0px) + 200px);
  color: var(--text-primary, #111);
  min-height: 100%;
  background: var(--canvas, #fff);
}
h1 {
  font-size: 44px;
  font-weight: 700;
  margin: 8px 0 12px;
  letter-spacing: -0.04em;
}
header p,
.download-location,
.empty {
  color: var(--text-secondary, #77777c);
  line-height: 1.6;
}
.eyebrow {
  font-size: 12px;
}
.download-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0;
}
.glass-control.primary {
  color: var(--accent, #fa2d48);
  flex: 1;
  min-width: 0;
  padding-inline: 12px;
  font-size: 13px;
}
.glass-control.icon-only {
  width: 48px;
  flex: 0 0 48px;
  padding: 0;
  font-size: 20px;
}
.download-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-secondary, #f2f2f7);
  border-radius: 24px;
  padding: 0 12px;
}
.download-search input {
  min-width: 0;
  width: 100%;
  min-height: 44px;
  background: transparent;
  outline: none;
}
.clear-failed {
  min-height: 44px;
  color: var(--accent, #fa2d48);
  margin-bottom: 12px;
}
button:disabled {
  opacity: 0.4;
}
.glass-control {
  min-height: 48px;
  border-radius: 999px;
  padding: 12px 24px;
  background: color-mix(in srgb, var(--canvas, #fff) 28%, transparent);
  border: 1px solid #8882;
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow:
    inset 0 1px #fff7,
    0 8px 24px #00000008;
}
.download-location {
  font-size: 12px;
}
.download-tabs {
  display: flex;
  gap: 8px;
  margin: 24px 0;
  border-bottom: 1px solid var(--divider, #d9d9de);
}
.download-tabs button {
  min-height: 48px;
  padding: 12px;
  border-bottom: 2px solid transparent;
}
.download-tabs button[aria-selected='true'] {
  color: var(--accent, #fa2d48);
  border-color: currentColor;
}
.download-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.download-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--divider, #d9d9de);
}
.download-list img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 16px;
}
.download-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.download-info strong {
  font-size: 16px;
  overflow-wrap: anywhere;
}
.download-info span {
  font-size: 12px;
  color: var(--text-secondary, #77777c);
}
progress {
  appearance: none;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  width: 100%;
  height: 4px;
  accent-color: var(--accent, #fa2d48);
}
progress::-webkit-progress-bar {
  background: var(--surface-secondary, #f2f2f7);
}
progress::-webkit-progress-value {
  background: #fa2d48;
  border-radius: 999px;
}
.icon-control {
  min-width: 44px;
  min-height: 48px;
  border-radius: 999px;
  font-size: 24px;
  color: var(--text-primary, #111);
}
button:active {
  transform: scale(0.94);
}
button {
  transition: transform 220ms cubic-bezier(0.2, 1.4, 0.3, 1);
}
button:focus-visible {
  outline: 2px solid var(--accent, #fa2d48);
  outline-offset: 4px;
}
.error {
  color: var(--accent, #fa2d48);
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
