<template>
  <div
    class="desktop-editorial home-container h-full w-full bg-white dark:bg-black transition-colors duration-500"
  >
    <n-scrollbar class="h-full">
      <div class="home-content w-full pb-32 page-padding">
        <div class="home-heading">
          <div>
            <h1>{{ t('comp.haruHome.title') }}</h1>
            <p class="home-subtitle">{{ t('comp.haruHome.subtitle') }}</p>
          </div>
          <button
            v-if="isAndroidApp"
            class="local-entry"
            type="button"
            @click="router.push('/device-music')"
          >
            <i class="ri-folder-music-line" /> 本地音乐
          </button>
        </div>
        <div class="content-sections">
          <home-album-section
            title="新发行专辑"
            :limit="6"
            :columns="5"
            :rows="1"
            @more="router.push('/album')"
          />

          <home-artists :title="t('comp.haruHome.artists')" :limit="15" />

          <home-new-songs :title="t('comp.recommendNewMusic.title')" :limit="20" />
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>

<script lang="ts" setup>
import { NScrollbar } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { isAndroidApp } from '@/utils';

import HomeAlbumSection from './components/HomeAlbumSection.vue';
import HomeArtists from './components/HomeArtists.vue';
import HomeNewSongs from './components/HomeNewSongs.vue';

defineOptions({
  name: 'DesktopHome'
});

const { t } = useI18n();
const router = useRouter();
</script>

<style lang="scss" scoped>
.home-container {
  position: relative;
}
.home-content {
  max-width: 1040px;
  margin-inline: auto;
  padding: 0 32px 160px;
}

.home-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 32px 0;
  border-bottom: 1px solid var(--divider, #d9d9de);
}
.home-heading h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.home-subtitle {
  margin: 8px 0 0;
  color: var(--text-secondary, #77777c);
  font-size: 14px;
}
.local-entry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--divider) 60%, transparent);
  border-radius: 18px;
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  color: var(--text-primary);
  font-size: 12px;
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.local-entry:active {
  transform: scale(0.96);
}
.content-sections > * {
  padding: 32px 0;
  border-bottom: 1px solid var(--divider, #d9d9de);
}
.content-sections > :last-child {
  border-bottom: 0;
}
:deep(.album-section > .grid) {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 24px;
}
:deep(.album-section > .grid > :first-child) {
  grid-column: span 2;
  grid-row: span 2;
}
:deep(.album-section > .grid > :first-child h3) {
  font-size: 17px;
  line-height: 24px;
}
:deep(.songs-grid) {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  column-gap: 32px;
}
:deep(.artist-heading h2) {
  color: var(--text-primary, #111);
  font-size: 22px;
}
:deep(.artist-name) {
  font-size: 14px;
  font-weight: 500;
}
:deep(.haru-more) {
  color: var(--accent, #fa2d48) !important;
}
@media (max-width: 767px) {
  .home-content {
    padding-inline: 16px;
  }
  .home-heading {
    padding: 24px 0;
  }
  .home-heading h1 {
    font-size: 34px;
  }
  :deep(.album-section > .grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 16px;
  }
  :deep(.album-section > .grid > :first-child) {
    grid-row: auto;
  }
  :deep(.songs-grid) {
    grid-template-columns: 1fr !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  :deep(.animate-item) {
    animation: none !important;
  }
}

/* Reveal only when the user enters the page; interactive feedback stays subtle. */
:deep(.animate-item) {
  animation: fadeInUp 0.24s cubic-bezier(0.23, 1, 0.32, 1) backwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stagger delays for sequential animations */
:deep(.animate-item) {
  @for $i from 1 through 20 {
    &:nth-child(#{$i}) {
      animation-delay: #{min($i, 5) * 0.025}s;
    }
  }
}
</style>
