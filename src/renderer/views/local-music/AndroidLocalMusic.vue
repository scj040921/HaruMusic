<template>
  <n-scrollbar class="h-full"
    ><main class="local-page">
      <h1>本地音乐</h1>
      <p>将设备里的音频导入音乐库，离线也可播放。</p>
      <input
        ref="picker"
        type="file"
        accept="audio/*,.flac,.m4a,.mp3,.wav,.ogg"
        multiple
        hidden
        @change="importFiles"
      />
      <button class="import" @click="picker?.click()"><i class="ri-add-line" /> 导入音频</button>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="!tracks.length" class="empty">还没有导入的音乐</p>
      <div v-for="track in tracks" :key="track.id" class="track">
        <button class="track-main" @click="play(track)">
          <i class="ri-music-2-line" /><span>{{ track.name }}</span>
        </button>
        <button class="remove" aria-label="移除歌曲" @click="remove(track.id)">
          <i class="ri-delete-bin-line" />
        </button>
      </div></main
  ></n-scrollbar>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';

import {
  type AndroidLocalTrack,
  listAndroidLocalTracks,
  removeAndroidLocalTrack,
  saveAndroidLocalTrack
} from '@/services/androidLocalMusic';
import { playTrack } from '@/services/playbackController';
import { usePlayerStore } from '@/store';
import type { SongResult } from '@/types/music';
const picker = ref<HTMLInputElement | null>(null);
const tracks = ref<AndroidLocalTrack[]>([]);
const error = ref('');
const player = usePlayerStore();
async function refresh() {
  tracks.value = await listAndroidLocalTracks();
}
async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  error.value = '';
  try {
    for (const file of files) {
      const id = `android-local:${file.name}:${file.size}:${file.lastModified}`;
      await saveAndroidLocalTrack({ id, name: file.name.replace(/\.[^.]+$/, ''), file });
    }
    await refresh();
  } catch {
    error.value = '导入失败，请检查可用存储空间并重试。';
  }
}
function asSong(track: AndroidLocalTrack): SongResult {
  return {
    id: track.id,
    name: track.name,
    picUrl: '',
    source: 'local',
    ar: [],
    al: { id: 0, name: '', picUrl: '' } as SongResult['al'],
    count: 0
  };
}
async function play(track: AndroidLocalTrack) {
  const songs = tracks.value.map(asSong);
  const song = asSong(track);
  player.prepareSongPlayback(song, songs);
  await playTrack(song, true);
}
async function remove(id: string) {
  await removeAndroidLocalTrack(id);
  await refresh();
}
onMounted(() => {
  void refresh().catch(() => {
    error.value = '无法读取本地音乐库。';
  });
});
</script>
<style scoped>
.local-page {
  max-width: 960px;
  margin: auto;
  padding: 32px 24px 160px;
}
h1 {
  font-size: 34px;
  font-weight: 700;
}
p {
  color: var(--text-secondary);
  margin-top: 8px;
}
.import,
.remove {
  border: 1px solid color-mix(in srgb, var(--divider) 60%, transparent);
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  border-radius: 18px;
  padding: 12px 16px;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.import {
  margin: 24px 0;
}
.import:active,
.remove:active,
.track-main:active {
  transform: scale(0.97);
}
.track {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--divider);
}
.track-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 16px 0;
}
.track-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-main i {
  font-size: 24px;
}
.remove {
  padding: 10px;
}
.empty {
  padding: 32px 0;
}
.error {
  color: #fa2d48;
}
</style>
