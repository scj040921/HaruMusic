<template>
  <n-scrollbar class="h-full">
    <main class="local-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">ON DEVICE</p>
          <h1>本地音乐</h1>
          <p>自动整理设备中的 FLAC，也可手动导入其它音频。</p>
        </div>
        <span v-if="tracks.length" class="track-count">{{ tracks.length }} 首</span>
      </header>
      <input
        ref="picker"
        type="file"
        accept="audio/*,.flac,.m4a,.mp3,.wav,.ogg,.lrc,text/plain"
        multiple
        hidden
        @change="importFiles"
      />
      <div class="local-actions">
        <button class="scan" type="button" :disabled="scanning" @click="scanFlac">
          <i :class="scanning ? 'ri-loader-4-line spin' : 'ri-refresh-line'" />
          {{ scanning ? '正在扫描 FLAC…' : '扫描设备 FLAC' }}
        </button>
        <button class="import" type="button" @click="picker?.click()">
          <i class="ri-add-line" /> 导入音频
        </button>
      </div>
      <p v-if="scanning" class="scan-status">正在读取设备音乐媒体库…</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="!tracks.length && !scanning" class="empty">
        还没有找到音乐。首次扫描时请允许访问音乐和音频。
      </p>
      <div
        v-for="track in tracks"
        :key="track.id"
        class="track"
        :data-track-id="track.id"
        :ref="(element) => observeTrack(element, track)"
      >
        <button class="track-main" type="button" @click="play(track)">
          <span class="track-art">
            <img v-if="track.cover" :src="track.cover" :alt="`${track.name} 封面`" />
            <i v-else class="ri-music-2-line" />
          </span>
          <span class="track-copy">
            <strong>{{ track.name }}</strong>
            <small>{{ track.artist || (track.uri ? '设备中的 FLAC' : '本地导入') }}</small>
          </span>
        </button>
        <button class="remove" type="button" aria-label="移除歌曲" @click="remove(track.id)">
          <i class="ri-delete-bin-line" />
        </button>
      </div>
    </main>
  </n-scrollbar>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import {
  ANDROID_LOCAL_METADATA_VERSION,
  type AndroidLocalTrack,
  getAndroidLocalMetadata,
  listAndroidLocalTracks,
  removeAndroidLocalTrack,
  saveAndroidLocalTracks,
  scanAndroidFlacTracks
} from '@/services/androidLocalMusic';
import { playTrack } from '@/services/playbackController';
import { usePlayerStore } from '@/store';
import type { SongResult } from '@/types/music';

const picker = ref<HTMLInputElement | null>(null);
const tracks = ref<AndroidLocalTrack[]>([]);
const error = ref('');
const scanning = ref(false);
const player = usePlayerStore();

const metadataObserver =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const track = (entry.target as HTMLElement & { __androidTrack?: AndroidLocalTrack })
              .__androidTrack;
            metadataObserver?.unobserve(entry.target);
            if (!track || !needsMetadata(track)) continue;
            void getAndroidLocalMetadata(track.id)
              .then((metadata) => {
                track.cover = metadata.cover;
                track.lyrics = metadata.lyrics;
                track.metadataLoaded = true;
              })
              .catch(() => {
                track.metadataLoaded = true;
              });
          }
        },
        { rootMargin: '180px 0px', threshold: 0.01 }
      );

function observeTrack(element: unknown, track: AndroidLocalTrack) {
  if (!(element instanceof HTMLElement) || !metadataObserver || !needsMetadata(track)) return;
  (element as HTMLElement & { __androidTrack?: AndroidLocalTrack }).__androidTrack = track;
  metadataObserver.observe(element);
}

function needsMetadata(track: AndroidLocalTrack) {
  return !track.metadataLoaded || track.metadataVersion !== ANDROID_LOCAL_METADATA_VERSION;
}

async function refresh() {
  tracks.value = await listAndroidLocalTracks();
  await nextTick();
  document.querySelectorAll<HTMLElement>('.local-page .track').forEach((element) => {
    const track = tracks.value.find((item) => item.id === element.dataset.trackId);
    if (track) observeTrack(element, track);
  });
}

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  error.value = '';
  try {
    const lyricFiles = files.filter((file) => /\.lrc$/i.test(file.name));
    const audioFiles = files.filter((file) => !/\.lrc$/i.test(file.name));
    const localName = (filename: string) => normalizeLocalName(filename.replace(/\.[^.]+$/, ''));
    const lyricByBasename = new Map(
      await Promise.all(
        lyricFiles.map(async (file) => [localName(file.name), await file.text()] as const)
      )
    );
    const isAudioFile = (file: File) =>
      file.type.startsWith('audio/') || /\.(flac|mp3|m4a|wav|ogg|aac)$/i.test(file.name);
    const supportedAudioFiles = audioFiles.filter(isAudioFile);

    await saveAndroidLocalTracks(
      supportedAudioFiles.map((file) => ({
        id: `android-local:${file.name}:${file.size}:${file.lastModified}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        file,
        lyrics: lyricByBasename.get(localName(file.name))
      }))
    );
    if (lyricFiles.length) {
      const existing = await listAndroidLocalTracks();
      for (const lyricFile of lyricFiles) {
        const track = existing.find(
          (item) => normalizeLocalName(item.name) === localName(lyricFile.name)
        );
        if (track) {
          track.lyrics = await lyricFile.text();
          track.metadataLoaded = true;
          track.metadataVersion = ANDROID_LOCAL_METADATA_VERSION;
          await saveAndroidLocalTracks([track]);
        }
      }
      if (
        !supportedAudioFiles.length &&
        !existing.some((item) => lyricByBasename.has(normalizeLocalName(item.name)))
      ) {
        error.value = '没有找到同名的本地歌曲，请同时选择音频文件和 .lrc 歌词文件。';
      }
    }
    await refresh();
  } catch {
    error.value = '导入失败，请检查可用存储空间并重试。';
  }
}

function normalizeLocalName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

async function scanFlac() {
  scanning.value = true;
  error.value = '';
  try {
    const scanned = await scanAndroidFlacTracks();
    await saveAndroidLocalTracks(scanned);
    await refresh();
    if (!scanned.length) error.value = '设备存储中没有找到 FLAC 文件。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '扫描存储中的 FLAC 文件失败。';
  } finally {
    scanning.value = false;
  }
}

function asSong(track: AndroidLocalTrack): SongResult {
  return {
    id: track.id,
    name: track.name,
    picUrl: track.cover || '',
    source: 'local',
    ar: track.artist ? ([{ id: 0, name: track.artist }] as SongResult['ar']) : [],
    al: { id: 0, name: track.album || '', picUrl: track.cover || '' } as SongResult['al'],
    dt: track.duration || 0,
    count: 0
  };
}

let playAttempt = 0;
async function play(track: AndroidLocalTrack) {
  const attempt = ++playAttempt;
  const songs = tracks.value.map(asSong);
  const song = asSong(track);
  player.prepareSongPlayback(song, songs);
  error.value = '';
  try {
    if (!(await playTrack(song, true)) && attempt === playAttempt) {
      error.value = '无法播放这首本地音乐，请检查文件是否仍可访问。';
    }
  } catch (cause) {
    if (attempt === playAttempt)
      error.value = cause instanceof Error ? cause.message : '无法播放这首本地音乐。';
  }
}

async function remove(id: string) {
  await removeAndroidLocalTrack(id);
  await refresh();
}

onMounted(async () => {
  try {
    await refresh();
    await scanFlac();
  } catch {
    error.value = '无法读取本地音乐库。';
  }
});

onBeforeUnmount(() => metadataObserver?.disconnect());
</script>
<style scoped>
.local-page {
  max-width: 960px;
  margin: auto;
  padding: 32px 24px 176px;
}
.page-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--divider);
}
.eyebrow {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
h1 {
  margin: 8px 0;
  font-size: 34px;
  font-weight: 700;
}
p {
  margin: 8px 0 0;
  color: var(--text-secondary);
}
.track-count {
  flex: none;
  color: var(--text-secondary);
  font-size: 13px;
}
.local-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0 12px;
}
.scan,
.import,
.remove {
  border: 1px solid color-mix(in srgb, var(--divider) 60%, transparent);
  border-radius: 18px;
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.scan,
.import {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-weight: 600;
}
.scan {
  color: var(--accent, #fa2d48);
}
.scan:disabled {
  opacity: 0.7;
}
.scan:active,
.import:active,
.remove:active,
.track-main:active {
  transform: scale(0.97);
}
.scan-status {
  margin: 12px 0;
  font-size: 12px;
}
.track {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--divider);
}
.track-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.track-art {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  flex: none;
  border-radius: 16px;
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-secondary);
  overflow: hidden;
}
.track-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.track-art i {
  font-size: 22px;
}
.track-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  text-align: left;
}
.track-copy strong,
.track-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-copy strong {
  font-size: 14px;
  font-weight: 600;
}
.track-copy small {
  color: var(--text-secondary);
  font-size: 12px;
}
.remove {
  flex: none;
  padding: 10px;
}
.empty {
  padding: 32px 0;
}
.error {
  margin: 12px 0;
  color: #fa2d48;
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .local-page {
    padding: 24px 16px 176px;
  }
  .local-actions {
    gap: 8px;
  }
  .scan,
  .import {
    padding: 11px 12px;
    font-size: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
