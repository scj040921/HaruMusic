<template>
  <div class="home-container h-full w-full bg-white dark:bg-black transition-colors duration-500">
    <desktop-home v-if="isElectron || isAndroidApp" />
    <n-scrollbar v-else class="h-full">
      <div class="home-content w-full pb-32 page-padding">
        <div class="home-heading">
          <div>
            <h1>{{ t('comp.haruHome.title') }}</h1>
            <p class="home-subtitle">{{ t('comp.haruHome.subtitle') }}</p>
          </div>
        </div>
        <home-hero />

        <!-- Main Content Sections -->
        <div class="content-sections space-y-10 md:space-y-8 lg:space-y-12">
          <!-- Recommended Playlists (Grid Section) -->
          <home-playlist-section
            :title="t('comp.recommendSonglist.title')"
            :limit="10"
            :rows="2"
            @more="router.push('/list')"
          />

          <!-- Hot Artists (Horizontal Scroll Section) -->
          <home-artists :title="t('comp.haruHome.artists')" :limit="15" />

          <!-- New Albums (NEW - 新碟上架) -->
          <home-album-section
            :title="t('comp.newAlbum.title')"
            :limit="6"
            :columns="5"
            :rows="1"
            @more="router.push('/album')"
          />

          <!-- New Songs (Compact Grid Section) -->
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

import { isAndroidApp, isElectron } from '@/utils';

import HomeAlbumSection from './components/HomeAlbumSection.vue';
import HomeArtists from './components/HomeArtists.vue';
import HomeHero from './components/HomeHero.vue';
import HomeNewSongs from './components/HomeNewSongs.vue';
import HomePlaylistSection from './components/HomePlaylistSection.vue';
import DesktopHome from './DesktopHome.vue';

defineOptions({
  name: 'Home'
});

const { t } = useI18n();
const router = useRouter();
</script>

<style lang="scss" scoped>
.home-container {
  position: relative;
}

.home-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 22px 0 25px;
}
.home-heading h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.home-subtitle {
  margin: 9px 0 0;
  color: #737e7d;
  font-size: 14px;
}
@media (max-width: 767px) {
  .home-heading {
    padding: 14px 0 20px;
  }
  .home-heading h1 {
    font-size: 26px;
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
