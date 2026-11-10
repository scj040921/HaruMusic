<template>
  <n-popover trigger="click" placement="top" :show-arrow="false" :z-index="9999999" raw>
    <template #trigger>
      <button
        class="quality-trigger"
        type="button"
        :disabled="!canChange || busy"
        :aria-label="t('player.playBar.songQuality')"
        :title="t('player.playBar.songQuality')"
        @click.stop
      >
        {{ t('player.playBar.qualityShort') }}
      </button>
    </template>
    <div class="quality-menu" @click.stop>
      <div class="quality-title">{{ t('player.playBar.songQuality') }}</div>
      <div class="quality-hint">{{ t('player.playBar.songQualityHint') }}</div>
      <div class="quality-options" role="group" :aria-label="t('player.playBar.songQuality')">
        <button
          v-for="item in options"
          :key="item.key"
          type="button"
          class="quality-option"
          :class="{ selected: selected === item.key }"
          :disabled="busy"
          :aria-pressed="selected === item.key"
          @click="selectQuality(item.key)"
        >
          <span>{{ item.label }}</span
          ><i v-if="selected === item.key" class="ri-check-line" aria-hidden="true" />
        </button>
      </div>
      <div v-if="busy" class="quality-hint" role="status">
        {{ t('player.playBar.qualityChanging') }}
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { useMessage } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { switchCurrentSongQuality } from '@/services/playbackController';
import { getSongQuality, SONG_QUALITIES, type SongQuality } from '@/services/songQuality';
import type { SongResult } from '@/types/music';

const props = defineProps<{ song: SongResult | null | undefined }>();
const { t } = useI18n();
const message = useMessage();
const busy = ref(false);
const selected = ref<SongQuality | 'default'>('default');
const canChange = computed(
  () =>
    !!props.song?.id &&
    Number.isSafeInteger(Number(props.song.id)) &&
    Number(props.song.id) > 0 &&
    !props.song.isPodcast
);
watch(
  () => props.song?.id,
  (id) => {
    selected.value = id ? (getSongQuality(id) ?? 'default') : 'default';
  },
  { immediate: true }
);
const options = computed(() => [
  { key: 'default' as const, label: t('player.playBar.qualityDefault') },
  ...SONG_QUALITIES.map((key) => ({ key, label: t(`settings.playback.qualityOptions.${key}`) }))
]);
const selectQuality = async (key: SongQuality | 'default') => {
  if (busy.value || !canChange.value || key === selected.value) return;
  busy.value = true;
  const songId = props.song?.id;
  try {
    const ok = await switchCurrentSongQuality(key === 'default' ? null : key);
    if (props.song?.id !== songId) return;
    if (ok) selected.value = key;
    else message.error(t('player.playBar.qualityFailed'));
  } catch {
    if (props.song?.id === songId) message.error(t('player.playBar.qualityFailed'));
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.quality-trigger {
  min-width: 42px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #b7c9c2;
  border-radius: 7px;
  color: #315f55;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.quality-trigger:hover {
  background: #e5efeb;
}
.quality-trigger:focus-visible,
.quality-option:focus-visible {
  outline: 2px solid #4b8173;
  outline-offset: 2px;
}
.quality-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.quality-menu {
  width: 220px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  color: #263631;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.14);
}
.quality-title {
  font-size: 14px;
  font-weight: 700;
}
.quality-hint {
  color: #66756f;
  font-size: 12px;
  margin-top: 5px;
  line-height: 1.45;
}
.quality-options {
  display: grid;
  gap: 2px;
  max-height: 290px;
  overflow-y: auto;
  margin-top: 10px;
}
.quality-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 0;
  border-radius: 6px;
  text-align: left;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}
.quality-option:hover,
.quality-option.selected {
  background: #e5efeb;
  color: #315f55;
}
.quality-option:disabled {
  opacity: 0.55;
  cursor: wait;
}
:global(.dark) .quality-menu {
  background: #252c29;
  color: #f2f7f4;
}
:global(.dark) .quality-hint {
  color: #a8bbb3;
}
:global(.dark) .quality-option:hover,
:global(.dark) .quality-option.selected {
  background: #385148;
  color: #eef9f3;
}
:global(.dark) .quality-trigger {
  color: #b5d5c8;
  border-color: #516e62;
}
</style>
