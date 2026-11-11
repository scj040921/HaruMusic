<template>
  <n-scrollbar class="artists-page h-full">
    <main class="artists-content">
      <header>
        <p class="eyebrow">DISCOVER</p>
        <h1>探索艺人</h1>
        <p>从熟悉的声音出发，发现更多音乐。</p>
      </header>
      <nav class="filters" aria-label="艺人分类">
        <button
          v-for="item in areas"
          :key="item.value"
          :class="{ active: area === item.value }"
          @click="area = item.value"
        >
          {{ item.label }}
        </button>
      </nav>
      <nav class="filters types" aria-label="艺人类型">
        <button
          v-for="item in types"
          :key="item.value"
          :class="{ active: type === item.value }"
          @click="type = item.value"
        >
          {{ item.label }}
        </button>
      </nav>
      <div v-if="loading" class="status">正在加载艺人…</div>
      <div v-else-if="error" class="status">加载失败 <button @click="load()">重试</button></div>
      <div v-else class="artist-grid">
        <button
          v-for="artist in artists"
          :key="artist.id"
          class="artist-card"
          @click="router.push(`/artist/detail/${artist.id}`)"
        >
          <img
            :src="getImgUrl(artist.picUrl || artist.img1v1Url, '512y512')"
            :alt="artist.name"
            loading="lazy"
          />
          <span>{{ artist.name }}</span>
        </button>
      </div>
      <button v-if="more && !loading" class="more" @click="loadMore">加载更多</button>
    </main>
  </n-scrollbar>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { getImgUrl } from '@/utils';
import request from '@/utils/request';
defineOptions({ name: 'Artists' });
const router = useRouter();
const areas = [
  { label: '全部', value: -1 },
  { label: '华语', value: 7 },
  { label: '欧美', value: 96 },
  { label: '日本', value: 8 },
  { label: '韩国', value: 16 },
  { label: '其他', value: 0 }
];
const types = [
  { label: '全部', value: -1 },
  { label: '男歌手', value: 1 },
  { label: '女歌手', value: 2 },
  { label: '乐队 / 组合', value: 3 }
];
const area = ref(-1);
const type = ref(-1);
const artists = ref<any[]>([]);
const loading = ref(false);
const error = ref(false);
const more = ref(false);
const offset = ref(0);
let generation = 0;
async function load(append = false) {
  const current = ++generation;
  loading.value = true;
  error.value = false;
  if (!append) offset.value = 0;
  try {
    const { data } = await request.get('/artist/list', {
      params: { area: area.value, type: type.value, limit: 30, offset: offset.value }
    });
    if (current !== generation) return;
    const list = Array.isArray(data.artists) ? data.artists : [];
    artists.value = append
      ? [
          ...artists.value,
          ...list.filter((item: any) => !artists.value.some((old) => old.id === item.id))
        ]
      : list;
    more.value = Boolean(data.more);
  } catch {
    if (current === generation) error.value = true;
  } finally {
    if (current === generation) loading.value = false;
  }
}
function loadMore() {
  offset.value += 30;
  void load(true);
}
watch([area, type], () => void load());
onMounted(() => void load());
</script>

<style scoped>
.artists-content {
  max-width: 1100px;
  margin: auto;
  padding: 32px 24px 160px;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.15em;
  font-weight: 700;
  color: var(--text-secondary);
}
h1 {
  font-size: 34px;
  font-weight: 700;
  margin: 8px 0;
}
header > p:last-child {
  color: var(--text-secondary);
}
.filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-top: 24px;
  padding-bottom: 4px;
}
.filters.types {
  margin-top: 12px;
}
.filters button,
.more {
  white-space: nowrap;
  border: 0;
  border-radius: 999px;
  background: var(--surface-secondary, #f2f2f7);
  padding: 8px 16px;
  color: var(--text-primary, #111);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.filters button:active,
.artist-card:active,
.more:active {
  transform: scale(0.96);
}
.filters button.active {
  color: #fa2d48;
  font-weight: 700;
}
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 32px 24px;
  margin-top: 32px;
}
.artist-card {
  border: 0;
  padding: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.artist-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 24px;
}
.artist-card span {
  display: block;
  margin-top: 12px;
  font-weight: 600;
}
.status {
  padding: 48px 0;
  color: var(--text-secondary);
}
.more {
  display: block;
  margin: 32px auto;
}
@media (max-width: 600px) {
  .artists-content {
    padding: 24px 16px 160px;
  }
  .artist-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px 12px;
  }
  .artist-card img {
    border-radius: 16px;
  }
}
</style>
